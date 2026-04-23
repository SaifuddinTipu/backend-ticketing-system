import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type VenueDocument = HydratedDocument<Venue>;

@Schema({ _id: false })
export class SeatTemplate {
  @Prop({ required: true })
  section: string;

  @Prop({ required: true })
  row: string;

  @Prop({ required: true })
  number: string;

  @Prop({ required: true, enum: ['standard', 'premium', 'vip'] })
  priceTier: string;
}

export const SeatTemplateSchema = SchemaFactory.createForClass(SeatTemplate);

@Schema({ timestamps: true })
export class Venue {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  address: string;

  @Prop({ type: [SeatTemplateSchema], default: [] })
  seatMap: SeatTemplate[];
}

export const VenueSchema = SchemaFactory.createForClass(Venue);
