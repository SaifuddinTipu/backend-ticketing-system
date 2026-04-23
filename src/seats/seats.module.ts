import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Seat, SeatSchema } from './schemas/seat.schema';
import { Event, EventSchema } from '../events/schemas/event.schema';
import { SeatsService } from './seats.service';
import { SeatsController } from './seats.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Seat.name, schema: SeatSchema },
      { name: Event.name, schema: EventSchema },
    ]),
  ],
  controllers: [SeatsController],
  providers: [SeatsService],
  exports: [SeatsService, MongooseModule],
})
export class SeatsModule {}
