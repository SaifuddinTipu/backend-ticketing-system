import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Seat, SeatSchema } from './schemas/seat.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: Seat.name, schema: SeatSchema }])],
  exports: [MongooseModule],
})
export class SeatsModule {}
