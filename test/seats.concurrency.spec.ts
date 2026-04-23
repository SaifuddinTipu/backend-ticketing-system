/**
 * Concurrency test: 50 parallel hold requests on the same seat.
 * Proves the Redis Lua script is truly atomic — exactly 1 succeeds.
 *
 * Requires a real Redis instance. Set REDIS_URL env var (default: redis://localhost:6379).
 * Run with: npm run test:concurrency
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import Redis from 'ioredis';
import { readFileSync } from 'fs';
import { join } from 'path';
import { SeatsService } from '../src/seats/seats.service';
import { Seat, SeatStatus, PriceTier } from '../src/seats/schemas/seat.schema';
import { Event } from '../src/events/schemas/event.schema';
import { REDIS_CLIENT, LUA_HOLD_SEATS } from '../src/common/redis/redis.provider';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const CONCURRENCY = 50;

describe('Seat Hold Concurrency (real Redis)', () => {
  let service: SeatsService;
  let redis: Redis;
  let luaScript: string;

  const eventId = new Types.ObjectId().toHexString();
  const seatId = new Types.ObjectId().toHexString();

  const mockSeat = {
    _id: new Types.ObjectId(seatId),
    eventId: new Types.ObjectId(eventId),
    section: 'A',
    row: '1',
    number: '1',
    priceTier: PriceTier.STANDARD,
    price: 100,
    status: SeatStatus.AVAILABLE,
  };

  const mockEventModel = {
    findById: jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue({ _id: eventId }),
    }),
  };

  const mockSeatModel = {
    find: jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue([mockSeat]),
    }),
  };

  beforeAll(async () => {
    redis = new Redis(REDIS_URL);
    luaScript = readFileSync(
      join(__dirname, '..', 'src', 'seats', 'scripts', 'hold-seats.lua'),
      'utf8',
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SeatsService,
        { provide: getModelToken(Seat.name), useValue: mockSeatModel },
        { provide: getModelToken(Event.name), useValue: mockEventModel },
        { provide: REDIS_CLIENT, useValue: redis },
        { provide: LUA_HOLD_SEATS, useValue: luaScript },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(10) } },
      ],
    }).compile();

    service = module.get<SeatsService>(SeatsService);
  });

  beforeEach(async () => {
    await redis.del(service.holdKey(eventId, seatId));
  });

  afterAll(async () => {
    await redis.del(service.holdKey(eventId, seatId));
    redis.disconnect();
  });

  it('exactly 1 of 50 concurrent hold requests succeeds', async () => {
    const users = Array.from({ length: CONCURRENCY }, (_, i) => `user-${i}`);

    const results = await Promise.allSettled(
      users.map((userId) => service.holdSeats(eventId, [seatId], userId)),
    );

    const successes = results.filter((r) => r.status === 'fulfilled');
    const failures = results.filter((r) => r.status === 'rejected');

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(CONCURRENCY - 1);

    // The winner must actually hold the Redis key
    const holder = await redis.get(service.holdKey(eventId, seatId));
    expect(holder).not.toBeNull();
    expect(users).toContain(holder);
  });

  it('partial-hold rollback: if seat 2 is taken, seat 1 is NOT claimed', async () => {
    const seatId2 = new Types.ObjectId().toHexString();
    const key2 = service.holdKey(eventId, seatId2);

    // Pre-hold seatId2 as a blocker
    await redis.set(key2, 'blocker-user', 'EX', 30);

    // Mock returns two seats for this test
    mockSeatModel.find.mockReturnValueOnce({
      exec: jest.fn().mockResolvedValue([
        mockSeat,
        { ...mockSeat, _id: new Types.ObjectId(seatId2), number: '2' },
      ]),
    });

    await expect(
      service.holdSeats(eventId, [seatId, seatId2], 'attacker'),
    ).rejects.toThrow();

    // seatId must NOT have been claimed (Lua rolled back)
    const holder1 = await redis.get(service.holdKey(eventId, seatId));
    expect(holder1).toBeNull();

    await redis.del(key2);
  });

  it('after TTL expires the seat can be held again', async () => {
    const key = service.holdKey(eventId, seatId);
    // Manually plant a 1-second hold
    await redis.set(key, 'temp-user', 'EX', 1);
    expect(await redis.get(key)).toBe('temp-user');

    // Wait for TTL to expire
    await new Promise((r) => setTimeout(r, 1200));

    // Now a new user should be able to claim it via the Lua script
    const result = (await redis.eval(luaScript, 1, key, 'new-user', '10')) as number;
    expect(result).toBe(1);
    expect(await redis.get(key)).toBe('new-user');
  });
});
