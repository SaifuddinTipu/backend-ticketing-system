import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type TicketDocument = HydratedDocument<Ticket>;

export enum TicketStatus {
  ACTIVE = 'active',
  CANCELLED = 'cancelled',
  USED = 'used',
}

@Schema({ timestamps: true })
export class Ticket {
  @Prop({ type: Types.ObjectId, ref: 'Event', required: true })
  eventId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Seat', required: true })
  seatId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Order', required: false })
  orderId: Types.ObjectId;

  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  section: string;

  @Prop({ required: true })
  row: string;

  @Prop({ required: true })
  number: string;

  @Prop({ required: true, min: 0 })
  price: number;

  @Prop({ required: true, default: 'MYR' })
  currency: string;

  @Prop({ required: true, enum: TicketStatus, default: TicketStatus.ACTIVE })
  status: TicketStatus;
}

export const TicketSchema = SchemaFactory.createForClass(Ticket);

// Fast event-level ticket queries
TicketSchema.index({ eventId: 1, status: 1 });
// Fast user ticket lookup
TicketSchema.index({ userId: 1 });
