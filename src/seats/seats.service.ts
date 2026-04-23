import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import Redis from 'ioredis';
import { Seat, SeatDocument, SeatStatus } from './schemas/seat.schema';
import { Event, EventDocument } from '../events/schemas/event.schema';
import { REDIS_CLIENT, LUA_HOLD_SEATS } from '../common/redis/redis.provider';
import { ConfigService } from '@nestjs/config';
import {
  EventNotFoundException,
  SeatAlreadyHeldException,
  SeatNotHeldByUserException,
} from '../common/exceptions/domain.exceptions';

export interface SeatWithHold {
  _id: Types.ObjectId;
  eventId: Types.ObjectId;
  section: string;
  row: string;
  number: string;
  priceTier: string;
  price: number;
  status: SeatStatus;
  heldBy: string | null;
  heldUntil: Date | null;
}

@Injectable()
export class SeatsService {
  private readonly ttl: number;

  constructor(
    @InjectModel(Seat.name) private seatModel: Model<SeatDocument>,
    @InjectModel(Event.name) private eventModel: Model<EventDocument>,
    @Inject(REDIS_CLIENT) private redis: Redis,
    @Inject(LUA_HOLD_SEATS) private luaScript: string,
    config: ConfigService,
  ) {
    this.ttl = config.get<number>('SEAT_HOLD_TTL_SECONDS') ?? 600;
  }

  holdKey(eventId: string, seatId: string): string {
    return `seat:hold:${eventId}:${seatId}`;
  }

  async getSeatMap(eventId: string): Promise<{
    eventId: string;
    seats: SeatWithHold[];
    summary: { total: number; available: number; held: number; booked: number };
  }> {
    const event = await this.eventModel.findById(eventId).exec();
    if (!event) throw new EventNotFoundException(eventId);

    const seats = await this.seatModel.find({ eventId: new Types.ObjectId(eventId) }).exec();

    // Batch-fetch all hold keys from Redis in a single pipeline
    const pipeline = this.redis.pipeline();
    seats.forEach((s) => {
      pipeline.get(this.holdKey(eventId, s._id.toString()));
      pipeline.pttl(this.holdKey(eventId, s._id.toString()));
    });
    const results = await pipeline.exec();

    const seatsWithHold: SeatWithHold[] = seats.map((seat, i) => {
      const userId = results ? (results[i * 2]?.[1] as string | null) : null;
      const pttl = results ? (results[i * 2 + 1]?.[1] as number) : -1;

      let status = seat.status;
      let heldBy: string | null = null;
      let heldUntil: Date | null = null;

      if (seat.status === SeatStatus.AVAILABLE && userId) {
        status = SeatStatus.HELD;
        heldBy = userId;
        heldUntil = pttl > 0 ? new Date(Date.now() + pttl) : null;
      }

      return {
        _id: seat._id as Types.ObjectId,
        eventId: seat.eventId,
        section: seat.section,
        row: seat.row,
        number: seat.number,
        priceTier: seat.priceTier,
        price: seat.price,
        status,
        heldBy,
        heldUntil,
      };
    });

    const summary = {
      total: seatsWithHold.length,
      available: seatsWithHold.filter((s) => s.status === SeatStatus.AVAILABLE).length,
      held: seatsWithHold.filter((s) => s.status === SeatStatus.HELD).length,
      booked: seatsWithHold.filter((s) => s.status === SeatStatus.BOOKED).length,
    };

    return { eventId, seats: seatsWithHold, summary };
  }

  async holdSeats(
    eventId: string,
    seatIds: string[],
    userId: string,
  ): Promise<{ holdToken: string; seatIds: string[]; expiresAt: Date }> {
    const event = await this.eventModel.findById(eventId).exec();
    if (!event) throw new EventNotFoundException(eventId);

    // Verify all requested seats belong to this event and are not booked
    const seats = await this.seatModel
      .find({
        _id: { $in: seatIds.map((id) => new Types.ObjectId(id)) },
        eventId: new Types.ObjectId(eventId),
      })
      .exec();

    if (seats.length !== seatIds.length) {
      throw new SeatAlreadyHeldException('one or more seats not found for this event');
    }

    const bookedSeat = seats.find((s) => s.status === SeatStatus.BOOKED);
    if (bookedSeat) {
      throw new SeatAlreadyHeldException(bookedSeat._id.toString());
    }

    const keys = seatIds.map((id) => this.holdKey(eventId, id));

    // Use eval directly to avoid ioredis defineCommand variable-key issues.
    // KEYS = hold keys, ARGV[1] = userId, ARGV[2] = ttl
    const result = (await this.redis.eval(
      this.luaScript,
      keys.length,
      ...keys,
      userId,
      String(this.ttl),
    )) as number;

    if (result === 0) {
      throw new SeatAlreadyHeldException(seatIds[0]);
    }

    const expiresAt = new Date(Date.now() + this.ttl * 1000);
    const holdToken = `hold_${userId}_${Math.floor(Date.now() / 1000)}`;

    return { holdToken, seatIds, expiresAt };
  }

  async releaseSeats(
    eventId: string,
    seatIds: string[],
    userId: string,
  ): Promise<{ released: string[] }> {
    const event = await this.eventModel.findById(eventId).exec();
    if (!event) throw new EventNotFoundException(eventId);

    const released: string[] = [];

    for (const seatId of seatIds) {
      const key = this.holdKey(eventId, seatId);
      const holder = await this.redis.get(key);

      if (holder !== userId) {
        throw new SeatNotHeldByUserException(seatId);
      }

      await this.redis.del(key);
      released.push(seatId);
    }

    return { released };
  }
}
