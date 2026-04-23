import { FactoryProvider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { readFileSync } from 'fs';
import { join } from 'path';

export const REDIS_CLIENT = 'REDIS_CLIENT';
export const LUA_HOLD_SEATS = 'LUA_HOLD_SEATS';

export const RedisProvider: FactoryProvider<Redis> = {
  provide: REDIS_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    return new Redis(config.get<string>('REDIS_URL')!);
  },
};

export const LuaScriptProvider: FactoryProvider<string> = {
  provide: LUA_HOLD_SEATS,
  useFactory: () =>
    readFileSync(
      join(__dirname, '..', '..', 'seats', 'scripts', 'hold-seats.lua'),
      'utf8',
    ),
};
