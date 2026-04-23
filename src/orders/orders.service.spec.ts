import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { OrdersService } from './orders.service';
import { Order, OrderStatus } from './schemas/order.schema';
import { Ticket } from '../tickets/schemas/ticket.schema';
import { Seat, SeatStatus, PriceTier } from '../seats/schemas/seat.schema';
import { REDIS_CLIENT } from '../common/redis/redis.provider';
import {
  OrderNotFoundException,
  SeatsNotHeldException,
} from '../common/exceptions/domain.exceptions';

const eventId = new Types.ObjectId();
const seatId1 = new Types.ObjectId();
const seatId2 = new Types.ObjectId();
const ticketId1 = new Types.ObjectId();
const ticketId2 = new Types.ObjectId();
const orderId = new Types.ObjectId();
const userId = 'user-123';

const makeSeat = (id: Types.ObjectId, price = 100) => ({
  _id: id,
  eventId,
  section: 'A',
  row: '1',
  number: id.toHexString().slice(-1),
  priceTier: PriceTier.STANDARD,
  price,
  status: SeatStatus.AVAILABLE,
});

const makeTicket = (id: Types.ObjectId, seatId: Types.ObjectId) => {
  const t = {
    _id: id,
    eventId,
    seatId,
    orderId,
    userId,
    section: 'A',
    row: '1',
    number: '1',
    price: 100,
    currency: 'MYR',
  };
  return { ...t, toObject: () => ({ ...t }) };
};

const makeOrder = () => {
  const o = {
    _id: orderId,
    userId,
    eventId,
    ticketIds: [ticketId1, ticketId2],
    totalAmount: 200,
    currency: 'MYR',
    status: OrderStatus.CONFIRMED,
  };
  return { ...o, toObject: () => ({ ...o }) };
};

// Session mock that immediately runs the transaction callback
const mockSession = {
  withTransaction: jest.fn((cb: () => Promise<void>) => cb()),
  endSession: jest.fn().mockResolvedValue(undefined),
};

const mockOrderModel = {
  create: jest.fn(),
  find: jest.fn(),
  findById: jest.fn(),
  countDocuments: jest.fn(),
};

const mockTicketModel = {
  create: jest.fn(),
  updateMany: jest.fn(),
};

const mockSeatModel = {
  find: jest.fn(),
  updateMany: jest.fn(),
};

const mockConnection = {
  startSession: jest.fn().mockResolvedValue(mockSession),
};

const mockPipeline = {
  del: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue([]),
};

const mockRedis = {
  get: jest.fn(),
  pipeline: jest.fn().mockReturnValue(mockPipeline),
};

describe('OrdersService', () => {
  let service: OrdersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getModelToken(Order.name), useValue: mockOrderModel },
        { provide: getModelToken(Ticket.name), useValue: mockTicketModel },
        { provide: getModelToken(Seat.name), useValue: mockSeatModel },
        { provide: getConnectionToken(), useValue: mockConnection },
        { provide: REDIS_CLIENT, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    jest.clearAllMocks();
    mockConnection.startSession.mockResolvedValue(mockSession);
    mockSession.withTransaction.mockImplementation((cb: () => Promise<void>) => cb());
    mockSession.endSession.mockResolvedValue(undefined);
    mockRedis.pipeline.mockReturnValue(mockPipeline);
    mockPipeline.del.mockReturnThis();
    mockPipeline.exec.mockResolvedValue([]);
  });

  describe('create', () => {
    const setupHappyPath = () => {
      const seats = [makeSeat(seatId1, 100), makeSeat(seatId2, 100)];
      mockSeatModel.find.mockReturnValue({ exec: jest.fn().mockResolvedValue(seats) });
      mockRedis.get.mockResolvedValue(userId);
      const tickets = [makeTicket(ticketId1, seatId1), makeTicket(ticketId2, seatId2)];
      mockTicketModel.create.mockResolvedValue(tickets);
      const order = makeOrder();
      mockOrderModel.create.mockResolvedValue([order]);
      mockTicketModel.updateMany.mockResolvedValue({ modifiedCount: 2 });
      mockSeatModel.updateMany.mockResolvedValue({ modifiedCount: 2 });
      return { seats, tickets, order };
    };

    it('creates order with tickets and returns embedded result', async () => {
      const { order } = setupHappyPath();
      const result = await service.create({ seatIds: [seatId1.toHexString(), seatId2.toHexString()] }, userId);
      expect(result._id).toEqual(order._id);
      expect(result.status).toBe(OrderStatus.CONFIRMED);
    });

    it('marks seats as BOOKED in transaction', async () => {
      setupHappyPath();
      await service.create({ seatIds: [seatId1.toHexString(), seatId2.toHexString()] }, userId);
      expect(mockSeatModel.updateMany).toHaveBeenCalledWith(
        { _id: { $in: expect.any(Array) } },
        { status: SeatStatus.BOOKED },
        { session: mockSession },
      );
    });

    it('deletes Redis holds after transaction', async () => {
      setupHappyPath();
      await service.create({ seatIds: [seatId1.toHexString(), seatId2.toHexString()] }, userId);
      expect(mockPipeline.del).toHaveBeenCalledTimes(2);
      expect(mockPipeline.exec).toHaveBeenCalled();
    });

    it('calculates totalAmount correctly', async () => {
      setupHappyPath();
      await service.create({ seatIds: [seatId1.toHexString(), seatId2.toHexString()] }, userId);
      expect(mockOrderModel.create).toHaveBeenCalledWith(
        [expect.objectContaining({ totalAmount: 200 })],
        { session: mockSession },
      );
    });

    it('throws SeatsNotHeldException when seat count mismatches', async () => {
      mockSeatModel.find.mockReturnValue({ exec: jest.fn().mockResolvedValue([makeSeat(seatId1)]) });
      await expect(
        service.create({ seatIds: [seatId1.toHexString(), seatId2.toHexString()] }, userId),
      ).rejects.toThrow(SeatsNotHeldException);
    });

    it('throws SeatsNotHeldException when Redis hold belongs to different user', async () => {
      mockSeatModel.find.mockReturnValue({ exec: jest.fn().mockResolvedValue([makeSeat(seatId1)]) });
      mockRedis.get.mockResolvedValue('other-user');
      await expect(
        service.create({ seatIds: [seatId1.toHexString()] }, userId),
      ).rejects.toThrow(SeatsNotHeldException);
    });

    it('throws SeatsNotHeldException when Redis hold is null (expired)', async () => {
      mockSeatModel.find.mockReturnValue({ exec: jest.fn().mockResolvedValue([makeSeat(seatId1)]) });
      mockRedis.get.mockResolvedValue(null);
      await expect(
        service.create({ seatIds: [seatId1.toHexString()] }, userId),
      ).rejects.toThrow(SeatsNotHeldException);
    });
  });

  describe('findOne', () => {
    it('returns order when found', async () => {
      const order = makeOrder();
      mockOrderModel.findById.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(order),
      });
      const result = await service.findOne(orderId.toHexString());
      expect(result._id).toEqual(orderId);
    });

    it('throws OrderNotFoundException when not found', async () => {
      mockOrderModel.findById.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null),
      });
      await expect(service.findOne('bad-id')).rejects.toThrow(OrderNotFoundException);
    });
  });

  describe('findAll', () => {
    it('returns paginated orders for userId', async () => {
      const orders = [makeOrder()];
      mockOrderModel.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(orders),
      });
      mockOrderModel.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(1) });
      const result = await service.findAll(userId, { page: 1, limit: 20 });
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(mockOrderModel.find).toHaveBeenCalledWith({ userId });
    });
  });
});
