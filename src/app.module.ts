import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { envValidationSchema } from './config/env.validation';
import { RedisModule } from './common/redis/redis.module';
import { HealthModule } from './health/health.module';
import { VenuesModule } from './venues/venues.module';
import { EventsModule } from './events/events.module';
import { SeatsModule } from './seats/seats.module';
import { OrdersModule } from './orders/orders.module';
import { TicketsModule } from './tickets/tickets.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: true },
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGO_URI'),
      }),
    }),
    RedisModule,
    HealthModule,
    VenuesModule,
    EventsModule,
    SeatsModule,
    OrdersModule,
    TicketsModule,
  ],
})
export class AppModule {}
