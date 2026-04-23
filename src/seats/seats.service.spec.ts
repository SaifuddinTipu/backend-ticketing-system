import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { SeatsService } from './seats.service';
import { Seat, SeatStatus, PriceTier } from './schemas/seat.schema';
import { Event } from '../events/schemas/event.schema';
import { REDIS_CLIENT, LUA_HOLD_SEATS } from '../common/redis/redis.provider';
import {
  EventNotFoundException,
  SeatAlreadyHeldException,
  SeatNotHeldByUserException,
} from '../common/exceptions/domain.exceptions';

const eventId = new Types.ObjectId().toHexString();
const seatId1 = new Types.ObjectId().toHexString();
const seatId2 = new Types.ObjectId().toHexString();

const mockSeat = (id: string, status = SeatStatus.AVAILABLE) => ({
  _id: new Types.ObjectId(id),
  eventId: new Types.ObjectId(eventId),
  section: 'A',
  row: '1',
  number: id.slice(-1),
  priceTier: PriceTier.STANDARD,
  price: 100,
  status,
});

const mockEventModel = { findById: jest.fn() };
const mockSeatModel = { find: jest.fn() };
const mockRedis = {
  pipeline: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
  eval: jest.fn(),
};
const mockConfig = { get: jest.fn().mockReturnValue(600) };
const mockLua = '-- mock lua script';

describe('SeatsService', () => {
  let service: SeatsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SeatsService,
        { provide: getModelToken(Seat.name), useValue: mockSeatModel },
        { provide: getModelToken(Event.name), useValue: mockEventModel },
        { provide: REDIS_CLIENT, useValue: mockRedis },
        { provide: LUA_HOLD_SEATS, useValue: mockLua },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();
    service = module.get<SeatsService>(SeatsService);
    jest.clearAllMocks();
  });

  // ── getSeatMap ────────────────────────────────────────────────────────────
  describe('getSeatMap', () => {
    it('throws EventNotFoundException when event not found', async () => {
      mockEventModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
      await expect(service.getSeatMap(eventId)).rejects.toThrow(EventNotFoundException);
    });

    it('returns seats with available status when no Redis holds exist', async () => {
      mockEventModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue({ _id: eventId }) });
      const seats = [mockSeat(seatId1), mockSeat(seatId2)];
      mockSeatModel.find.mockReturnValue({ exec: jest.fn().mockResolvedValue(seats) });

      const pipeline = {
        get: jest.fn().mockReturnThis(),
        pttl: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([[null, null], [null, -1], [null, null], [null, -1]]),
      };
      mockRedis.pipeline.mockReturnValue(pipeline);

      const result = await service.getSeatMap(eventId);
      expect(result.seats).toHaveLength(2);
      expect(result.summary.available).toBe(2);
      expect(result.summary.held).toBe(0);
    });

    it('marks seat as held when Redis hold exists', async () => {
      mockEventModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue({ _id: eventId }) });
      const seats = [mockSeat(seatId1)];
      mockSeatModel.find.mockReturnValue({ exec: jest.fn().mockResolvedValue(seats) });

      const pipeline = {
        get: jest.fn().mockReturnThis(),
        pttl: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([[null, 'user-99'], [null, 300000]]),
      };
      mockRedis.pipeline.mockReturnValue(pipeline);

      const result = await service.getSeatMap(eventId);
      expect(result.seats[0].status).toBe(SeatStatus.HELD);
      expect(result.seats[0].heldBy).toBe('user-99');
      expect(result.summary.held).toBe(1);
    });
  });

  // ── holdSeats ─────────────────────────────────────────────────────────────
  describe('holdSeats', () => {
    it('throws EventNotFoundException when event not found', async () => {
      mockEventModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
      await expect(service.holdSeats(eventId, [seatId1], 'user-1')).rejects.toThrow(EventNotFoundException);
    });

    it('throws SeatAlreadyHeldException when seat count mismatches', async () => {
      mockEventModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue({ _id: eventId }) });
      mockSeatModel.find.mockReturnValue({ exec: jest.fn().mockResolvedValue([mockSeat(seatId1)]) });
      await expect(service.holdSeats(eventId, [seatId1, seatId2], 'user-1')).rejects.toThrow(SeatAlreadyHeldException);
    });

    it('throws SeatAlreadyHeldException when a seat is already booked', async () => {
      mockEventModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue({ _id: eventId }) });
      mockSeatModel.find.mockReturnValue({ exec: jest.fn().mockResolvedValue([mockSeat(seatId1, SeatStatus.BOOKED)]) });
      await expect(service.holdSeats(eventId, [seatId1], 'user-1')).rejects.toThrow(SeatAlreadyHeldException);
    });

    it('throws SeatAlreadyHeldException when Lua eval returns 0', async () => {
      mockEventModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue({ _id: eventId }) });
      mockSeatModel.find.mockReturnValue({ exec: jest.fn().mockResolvedValue([mockSeat(seatId1)]) });
      mockRedis.eval.mockResolvedValue(0);
      await expect(service.holdSeats(eventId, [seatId1], 'user-1')).rejects.toThrow(SeatAlreadyHeldException);
    });

    it('returns holdToken and expiresAt on success', async () => {
      mockEventModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue({ _id: eventId }) });
      mockSeatModel.find.mockReturnValue({ exec: jest.fn().mockResolvedValue([mockSeat(seatId1)]) });
      mockRedis.eval.mockResolvedValue(1);

      const result = await service.holdSeats(eventId, [seatId1], 'user-1');
      expect(result.holdToken).toMatch(/^hold_user-1_/);
      expect(result.seatIds).toEqual([seatId1]);
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('calls redis.eval with correct KEYS and ARGV', async () => {
      mockEventModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue({ _id: eventId }) });
      mockSeatModel.find.mockReturnValue({ exec: jest.fn().mockResolvedValue([mockSeat(seatId1)]) });
      mockRedis.eval.mockResolvedValue(1);

      await service.holdSeats(eventId, [seatId1], 'user-42');
      expect(mockRedis.eval).toHaveBeenCalledWith(
        mockLua,
        1,
        `seat:hold:${eventId}:${seatId1}`,
        'user-42',
        '600',
      );
    });
  });

  // ── releaseSeats ──────────────────────────────────────────────────────────
  describe('releaseSeats', () => {
    it('throws EventNotFoundException when event not found', async () => {
      mockEventModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
      await expect(service.releaseSeats(eventId, [seatId1], 'user-1')).rejects.toThrow(EventNotFoundException);
    });

    it('throws SeatNotHeldByUserException when held by different user', async () => {
      mockEventModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue({ _id: eventId }) });
      mockRedis.get.mockResolvedValue('user-other');
      await expect(service.releaseSeats(eventId, [seatId1], 'user-1')).rejects.toThrow(SeatNotHeldByUserException);
    });

    it('throws SeatNotHeldByUserException when seat has no hold', async () => {
      mockEventModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue({ _id: eventId }) });
      mockRedis.get.mockResolvedValue(null);
      await expect(service.releaseSeats(eventId, [seatId1], 'user-1')).rejects.toThrow(SeatNotHeldByUserException);
    });

    it('deletes Redis keys and returns released list on success', async () => {
      mockEventModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue({ _id: eventId }) });
      mockRedis.get.mockResolvedValue('user-1');
      mockRedis.del.mockResolvedValue(1);

      const result = await service.releaseSeats(eventId, [seatId1], 'user-1');
      expect(result.released).toEqual([seatId1]);
      expect(mockRedis.del).toHaveBeenCalledWith(`seat:hold:${eventId}:${seatId1}`);
    });
  });
});
