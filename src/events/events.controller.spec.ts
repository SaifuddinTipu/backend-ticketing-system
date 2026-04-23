import { Test, TestingModule } from '@nestjs/testing';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { EventStatus } from './schemas/event.schema';

const mockEvent = {
  _id: 'event-id-1',
  name: 'Concert',
  venueId: 'venue-id-1',
  startAt: new Date(),
  endAt: new Date(),
  basePrice: 100,
  currency: 'MYR',
  status: EventStatus.DRAFT,
};

const mockEventsService = {
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  cancel: jest.fn(),
};

describe('EventsController', () => {
  let controller: EventsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [{ provide: EventsService, useValue: mockEventsService }],
    }).compile();
    controller = module.get<EventsController>(EventsController);
    jest.clearAllMocks();
  });

  it('create delegates to service', async () => {
    mockEventsService.create.mockResolvedValue(mockEvent);
    const dto = { name: 'Concert', venueId: 'venue-id-1', startAt: new Date(), endAt: new Date(), basePrice: 100, currency: 'MYR' };
    const result = await controller.create(dto);
    expect(result).toEqual(mockEvent);
    expect(mockEventsService.create).toHaveBeenCalledWith(dto);
  });

  it('findAll delegates to service with query', async () => {
    const paginated = { data: [mockEvent], total: 1, page: 1, limit: 20 };
    mockEventsService.findAll.mockResolvedValue(paginated);
    const result = await controller.findAll({ page: 1, limit: 20 });
    expect(result).toEqual(paginated);
  });

  it('findOne delegates to service with id', async () => {
    mockEventsService.findOne.mockResolvedValue(mockEvent);
    const result = await controller.findOne('event-id-1');
    expect(result).toEqual(mockEvent);
    expect(mockEventsService.findOne).toHaveBeenCalledWith('event-id-1');
  });

  it('update delegates to service', async () => {
    const updated = { ...mockEvent, name: 'Updated' };
    mockEventsService.update.mockResolvedValue(updated);
    const result = await controller.update('event-id-1', { name: 'Updated' });
    expect(result).toEqual(updated);
  });

  it('cancel delegates to service', async () => {
    const cancelled = { ...mockEvent, status: EventStatus.CANCELLED };
    mockEventsService.cancel.mockResolvedValue(cancelled);
    const result = await controller.cancel('event-id-1');
    expect(result.status).toBe(EventStatus.CANCELLED);
    expect(mockEventsService.cancel).toHaveBeenCalledWith('event-id-1');
  });
});
