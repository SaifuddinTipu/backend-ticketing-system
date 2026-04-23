import { Inject, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import Redis from 'ioredis';
import { Order, OrderDocument, OrderStatus } from './schemas/order.schema';
import { Ticket, TicketDocument } from '../tickets/schemas/ticket.schema';
import { Seat, SeatDocument, SeatStatus } from '../seats/schemas/seat.schema';
import { REDIS_CLIENT } from '../common/redis/redis.provider';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersDto } from './dto/list-orders.dto';
import {
  OrderNotFoundException,
  SeatsNotHeldException,
} from '../common/exceptions/domain.exceptions';

@Injectable()
export class OrdersService {
  constructor(
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(Ticket.name) private ticketModel: Model<TicketDocument>,
    @InjectModel(Seat.name) private seatModel: Model<SeatDocument>,
    @InjectConnection() private connection: Connection,
    @Inject(REDIS_CLIENT) private redis: Redis,
  ) {}

  private holdKey(eventId: string, seatId: string): string {
    return `seat:hold:${eventId}:${seatId}`;
  }

  async create(dto: CreateOrderDto, userId: string): Promise<OrderDocument & { tickets: TicketDocument[] }> {
    // Load all seats to determine eventId and prices
    const seats = await this.seatModel
      .find({ _id: { $in: dto.seatIds.map((id) => new Types.ObjectId(id)) } })
      .exec();

    if (seats.length !== dto.seatIds.length) {
      throw new SeatsNotHeldException();
    }

    // Verify every seat hold in Redis belongs to this user
    const eventId = seats[0].eventId.toString();
    for (const seat of seats) {
      const key = this.holdKey(seat.eventId.toString(), seat._id.toString());
      const holder = await this.redis.get(key);
      if (holder !== userId) {
        throw new SeatsNotHeldException();
      }
    }

    const totalAmount = seats.reduce((sum, s) => sum + s.price, 0);
    const currency = 'MYR';

    // MongoDB transaction: create tickets + order + mark seats booked + delete holds
    const session = await this.connection.startSession();
    let order!: OrderDocument;
    let tickets!: TicketDocument[];

    try {
      await session.withTransaction(async () => {
        // 1. Create ticket documents
        tickets = await this.ticketModel.create(
          seats.map((seat) => ({
            eventId: seat.eventId,
            seatId: seat._id,
            userId,
            section: seat.section,
            row: seat.row,
            number: seat.number,
            price: seat.price,
            currency,
          })),
          { session },
        );

        // 2. Create the order
        const [created] = await this.orderModel.create(
          [
            {
              userId,
              eventId: seats[0].eventId,
              ticketIds: tickets.map((t) => t._id),
              totalAmount: +totalAmount.toFixed(2),
              currency,
              status: OrderStatus.CONFIRMED,
            },
          ],
          { session },
        );
        order = created;

        // 3. Stamp orderId onto each ticket
        const orderId = order._id as Types.ObjectId;
        await this.ticketModel.updateMany(
          { _id: { $in: tickets.map((t) => t._id) } },
          { orderId },
          { session },
        );

        // 4. Mark seats as booked
        await this.seatModel.updateMany(
          { _id: { $in: seats.map((s) => s._id) } },
          { status: SeatStatus.BOOKED },
          { session },
        );
      });
    } finally {
      await session.endSession();
    }

    // 5. Delete Redis holds outside the transaction (non-fatal if they already expired)
    const pipeline = this.redis.pipeline();
    seats.forEach((seat) => {
      pipeline.del(this.holdKey(seat.eventId.toString(), seat._id.toString()));
    });
    await pipeline.exec();

    // Stamp orderId on returned tickets (in-memory, already persisted above)
    const orderId = order._id as Types.ObjectId;
    const ticketsWithOrder = tickets.map((t) => {
      t.orderId = orderId;
      return t;
    });

    return Object.assign(order, { tickets: ticketsWithOrder });
  }

  async findAll(
    userId: string,
    query: ListOrdersDto,
  ): Promise<{ data: OrderDocument[]; total: number }> {
    const filter = { userId };
    const skip = (query.page - 1) * query.limit;
    const [data, total] = await Promise.all([
      this.orderModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(query.limit)
        .populate('ticketIds')
        .exec(),
      this.orderModel.countDocuments(filter).exec(),
    ]);
    return { data, total };
  }

  async findOne(id: string): Promise<OrderDocument> {
    const order = await this.orderModel
      .findById(id)
      .populate('ticketIds')
      .exec();
    if (!order) throw new OrderNotFoundException(id);
    return order;
  }
}
