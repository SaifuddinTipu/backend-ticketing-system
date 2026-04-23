import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type OrderDocument = HydratedDocument<Order>;

export enum OrderStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
}

@Schema({ timestamps: true })
export class Order {
  @Prop({ required: true })
  userId: string;

  @Prop({ type: Types.ObjectId, ref: 'Event', required: true })
  eventId: Types.ObjectId;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Ticket' }], default: [] })
  ticketIds: Types.ObjectId[];

  @Prop({ required: true, min: 0 })
  totalAmount: number;

  @Prop({ required: true, default: 'MYR' })
  currency: string;

  @Prop({ required: true, enum: OrderStatus, default: OrderStatus.CONFIRMED })
  status: OrderStatus;
}

export const OrderSchema = SchemaFactory.createForClass(Order);

// Fast user order history queries
OrderSchema.index({ userId: 1, createdAt: -1 });
