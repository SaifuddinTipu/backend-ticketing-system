import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { TicketNotFoundException } from '../common/exceptions/domain.exceptions';

const ticketId = new Types.ObjectId();
const mockTicket = {
  _id: ticketId,
  eventId: new Types.ObjectId(),
  seatId: new Types.ObjectId(),
  orderId: new Types.ObjectId(),
  userId: 'user-123',
  section: 'A',
  row: '1',
  number: '1',
  price: 100,
  currency: 'MYR',
  status: 'active',
};

const mockTicketsService = { findOne: jest.fn() };

describe('TicketsController', () => {
  let controller: TicketsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TicketsController],
      providers: [{ provide: TicketsService, useValue: mockTicketsService }],
    }).compile();
    controller = module.get<TicketsController>(TicketsController);
    jest.clearAllMocks();
  });

  it('findOne delegates to service with id', async () => {
    mockTicketsService.findOne.mockResolvedValue(mockTicket);
    const result = await controller.findOne(ticketId.toHexString());
    expect(result).toEqual(mockTicket);
    expect(mockTicketsService.findOne).toHaveBeenCalledWith(ticketId.toHexString());
  });

  it('propagates TicketNotFoundException from service', async () => {
    mockTicketsService.findOne.mockRejectedValue(new TicketNotFoundException('bad-id'));
    await expect(controller.findOne('bad-id')).rejects.toThrow(TicketNotFoundException);
  });
});
