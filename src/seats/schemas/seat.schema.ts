import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SeatDocument = HydratedDocument<Seat>;

export enum SeatStatus {
  AVAILABLE = 'available',
  HELD = 'held',
  BOOKED = 'booked',
}

export enum PriceTier {
  STANDARD = 'standard',
  PREMIUM = 'premium',
  VIP = 'vip',
}

export const PRICE_TIER_MULTIPLIER: Record<PriceTier, number> = {
  [PriceTier.STANDARD]: 1.0,
  [PriceTier.PREMIUM]: 1.5,
  [PriceTier.VIP]: 2.0,
};

@Schema({ timestamps: true })
export class Seat {
  @Prop({ type: Types.ObjectId, ref: 'Event', required: true })
  eventId: Types.ObjectId;

  @Prop({ required: true })
  section: string;

  @Prop({ required: true })
  row: string;

  @Prop({ required: true })
  number: string;

  @Prop({ required: true, enum: PriceTier })
  priceTier: PriceTier;

  @Prop({ required: true, min: 0 })
  price: number;

  @Prop({ required: true, enum: SeatStatus, default: SeatStatus.AVAILABLE })
  status: SeatStatus;
}

export const SeatSchema = SchemaFactory.createForClass(Seat);

// Unique seat within an event + compound query index
SeatSchema.index({ eventId: 1, section: 1, row: 1, number: 1 }, { unique: true });
// Fast availability queries
SeatSchema.index({ eventId: 1, status: 1 });
