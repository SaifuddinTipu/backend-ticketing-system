import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { TicketsService } from './tickets.service';
import { Ticket } from './schemas/ticket.schema';
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

const mockTicketModel = { findById: jest.fn() };

describe('TicketsService', () => {
  let service: TicketsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketsService,
        { provide: getModelToken(Ticket.name), useValue: mockTicketModel },
      ],
    }).compile();
    service = module.get<TicketsService>(TicketsService);
    jest.clearAllMocks();
  });

  it('returns ticket when found', async () => {
    mockTicketModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(mockTicket) });
    const result = await service.findOne(ticketId.toHexString());
    expect(result).toEqual(mockTicket);
  });

  it('throws TicketNotFoundException when not found', async () => {
    mockTicketModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
    await expect(service.findOne('bad-id')).rejects.toThrow(TicketNotFoundException);
  });
});
