import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Event, EventDocument, EventStatus } from './schemas/event.schema';
import { Seat, SeatDocument } from '../seats/schemas/seat.schema';
import { Venue, VenueDocument } from '../venues/schemas/venue.schema';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { ListEventsDto } from './dto/list-events.dto';
import {
  EventNotFoundException,
  VenueNotFoundException,
} from '../common/exceptions/domain.exceptions';
import { PRICE_TIER_MULTIPLIER, PriceTier } from '../seats/schemas/seat.schema';

@Injectable()
export class EventsService {
  constructor(
    @InjectModel(Event.name) private eventModel: Model<EventDocument>,
    @InjectModel(Seat.name) private seatModel: Model<SeatDocument>,
    @InjectModel(Venue.name) private venueModel: Model<VenueDocument>,
  ) {}

  async create(dto: CreateEventDto): Promise<EventDocument> {
    const venue = await this.venueModel.findById(dto.venueId).exec();
    if (!venue) throw new VenueNotFoundException(dto.venueId);

    const event = await this.eventModel.create({
      ...dto,
      venueId: new Types.ObjectId(dto.venueId),
    });

    // Generate one Seat document per physical seat in the venue
    if (venue.seatMap.length > 0) {
      const seats = venue.seatMap.map((template) => ({
        eventId: event._id,
        section: template.section,
        row: template.row,
        number: template.number,
        priceTier: template.priceTier,
        price: +(dto.basePrice * PRICE_TIER_MULTIPLIER[template.priceTier as PriceTier]).toFixed(2),
      }));
      await this.seatModel.insertMany(seats);
    }

    return event;
  }

  async findAll(query: ListEventsDto): Promise<{ data: EventDocument[]; total: number; page: number; limit: number }> {
    const filter: Record<string, unknown> = {};
    if (query.status) filter['status'] = query.status;

    const skip = (query.page - 1) * query.limit;
    const [data, total] = await Promise.all([
      this.eventModel.find(filter).skip(skip).limit(query.limit).exec(),
      this.eventModel.countDocuments(filter).exec(),
    ]);

    return { data, total, page: query.page, limit: query.limit };
  }

  async findOne(id: string): Promise<EventDocument> {
    const event = await this.eventModel.findById(id).exec();
    if (!event) throw new EventNotFoundException(id);
    return event;
  }

  async update(id: string, dto: UpdateEventDto): Promise<EventDocument> {
    const event = await this.eventModel
      .findByIdAndUpdate(id, dto, { new: true })
      .exec();
    if (!event) throw new EventNotFoundException(id);
    return event;
  }

  async cancel(id: string): Promise<EventDocument> {
    const event = await this.eventModel
      .findByIdAndUpdate(id, { status: EventStatus.CANCELLED }, { new: true })
      .exec();
    if (!event) throw new EventNotFoundException(id);
    return event;
  }
}
