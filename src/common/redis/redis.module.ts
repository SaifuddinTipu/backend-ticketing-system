import { Global, Module } from '@nestjs/common';
import { RedisProvider, LuaScriptProvider } from './redis.provider';

@Global()
@Module({
  providers: [RedisProvider, LuaScriptProvider],
  exports: [RedisProvider, LuaScriptProvider],
})
export class RedisModule {}
