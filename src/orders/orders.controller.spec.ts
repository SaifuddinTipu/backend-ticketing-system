import { Test, TestingModule } from '@nestjs/testing';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrderStatus } from './schemas/order.schema';
import { Types } from 'mongoose';

const orderId = new Types.ObjectId();
const userId = 'user-123';

const mockOrder = {
  _id: orderId,
  userId,
  eventId: new Types.ObjectId(),
  ticketIds: [],
  totalAmount: 200,
  currency: 'MYR',
  status: OrderStatus.CONFIRMED,
  tickets: [],
};

const mockOrdersService = {
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
};

describe('OrdersController', () => {
  let controller: OrdersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [{ provide: OrdersService, useValue: mockOrdersService }],
    }).compile();
    controller = module.get<OrdersController>(OrdersController);
    jest.clearAllMocks();
  });

  it('create delegates to service with dto and userId header', async () => {
    mockOrdersService.create.mockResolvedValue(mockOrder);
    const dto = { seatIds: ['s1', 's2'] };
    const result = await controller.create(dto, userId);
    expect(result).toEqual(mockOrder);
    expect(mockOrdersService.create).toHaveBeenCalledWith(dto, userId);
  });

  it('findAll delegates with userId and query', async () => {
    const paginated = { data: [mockOrder], total: 1 };
    mockOrdersService.findAll.mockResolvedValue(paginated);
    const result = await controller.findAll(userId, { page: 1, limit: 20 });
    expect(result).toEqual(paginated);
    expect(mockOrdersService.findAll).toHaveBeenCalledWith(userId, { page: 1, limit: 20 });
  });

  it('findOne delegates with id', async () => {
    mockOrdersService.findOne.mockResolvedValue(mockOrder);
    const result = await controller.findOne(orderId.toHexString());
    expect(result).toEqual(mockOrder);
    expect(mockOrdersService.findOne).toHaveBeenCalledWith(orderId.toHexString());
  });
});
