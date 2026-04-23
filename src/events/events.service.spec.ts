import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { EventsService } from './events.service';
import { Event, EventStatus } from './schemas/event.schema';
import { Seat } from '../seats/schemas/seat.schema';
import { Venue } from '../venues/schemas/venue.schema';
import {
  EventNotFoundException,
  VenueNotFoundException,
} from '../common/exceptions/domain.exceptions';
import mongoose from 'mongoose';

const venueId = new mongoose.Types.ObjectId().toHexString();
const eventId = new mongoose.Types.ObjectId();

const mockVenue = {
  _id: venueId,
  name: 'Axiata Arena',
  address: 'KL',
  seatMap: [
    { section: 'A', row: '1', number: '1', priceTier: 'standard' },
    { section: 'A', row: '1', number: '2', priceTier: 'vip' },
  ],
};

const mockEvent = {
  _id: eventId,
  name: 'Concert',
  venueId,
  startAt: new Date(),
  endAt: new Date(),
  basePrice: 100,
  currency: 'MYR',
  status: EventStatus.DRAFT,
};

const mockEventModel = {
  create: jest.fn(),
  find: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  countDocuments: jest.fn(),
};

const mockSeatModel = {
  insertMany: jest.fn(),
};

const mockVenueModel = {
  findById: jest.fn(),
};

describe('EventsService', () => {
  let service: EventsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: getModelToken(Event.name), useValue: mockEventModel },
        { provide: getModelToken(Seat.name), useValue: mockSeatModel },
        { provide: getModelToken(Venue.name), useValue: mockVenueModel },
      ],
    }).compile();
    service = module.get<EventsService>(EventsService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('creates event and generates seats from venue seat map', async () => {
      mockVenueModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(mockVenue) });
      mockEventModel.create.mockResolvedValue(mockEvent);
      mockSeatModel.insertMany.mockResolvedValue([]);

      const dto = {
        name: 'Concert',
        venueId,
        startAt: new Date(),
        endAt: new Date(),
        basePrice: 100,
        currency: 'MYR',
      };

      const result = await service.create(dto);
      expect(result).toEqual(mockEvent);
      expect(mockSeatModel.insertMany).toHaveBeenCalledTimes(1);
      const seats = mockSeatModel.insertMany.mock.calls[0][0] as Array<{ price: number; priceTier: string }>;
      expect(seats).toHaveLength(2);
      // standard = 100 * 1.0, vip = 100 * 2.0
      expect(seats[0].price).toBe(100);
      expect(seats[1].price).toBe(200);
    });

    it('throws VenueNotFoundException when venue does not exist', async () => {
      mockVenueModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
      await expect(
        service.create({ name: 'X', venueId: 'bad', startAt: new Date(), endAt: new Date(), basePrice: 100, currency: 'MYR' }),
      ).rejects.toThrow(VenueNotFoundException);
      expect(mockEventModel.create).not.toHaveBeenCalled();
    });

    it('skips seat generation when venue seatMap is empty', async () => {
      const emptyVenue = { ...mockVenue, seatMap: [] };
      mockVenueModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(emptyVenue) });
      mockEventModel.create.mockResolvedValue(mockEvent);

      await service.create({ name: 'X', venueId, startAt: new Date(), endAt: new Date(), basePrice: 100, currency: 'MYR' });
      expect(mockSeatModel.insertMany).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('returns paginated events', async () => {
      mockEventModel.find.mockReturnValue({ skip: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue([mockEvent]) });
      mockEventModel.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(1) });

      const result = await service.findAll({ page: 1, limit: 20 });
      expect(result.data).toEqual([mockEvent]);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
    });

    it('applies status filter', async () => {
      mockEventModel.find.mockReturnValue({ skip: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue([]) });
      mockEventModel.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(0) });

      await service.findAll({ status: EventStatus.PUBLISHED, page: 1, limit: 20 });
      expect(mockEventModel.find).toHaveBeenCalledWith({ status: EventStatus.PUBLISHED });
    });
  });

  describe('findOne', () => {
    it('returns event when found', async () => {
      mockEventModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(mockEvent) });
      const result = await service.findOne(eventId.toHexString());
      expect(result).toEqual(mockEvent);
    });

    it('throws EventNotFoundException when not found', async () => {
      mockEventModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
      await expect(service.findOne('bad-id')).rejects.toThrow(EventNotFoundException);
    });
  });

  describe('update', () => {
    it('updates and returns event', async () => {
      const updated = { ...mockEvent, name: 'Updated' };
      mockEventModel.findByIdAndUpdate.mockReturnValue({ exec: jest.fn().mockResolvedValue(updated) });
      const result = await service.update(eventId.toHexString(), { name: 'Updated' });
      expect(result).toEqual(updated);
    });

    it('throws EventNotFoundException when not found', async () => {
      mockEventModel.findByIdAndUpdate.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
      await expect(service.update('bad-id', { name: 'X' })).rejects.toThrow(EventNotFoundException);
    });
  });

  describe('cancel', () => {
    it('sets status to cancelled', async () => {
      const cancelled = { ...mockEvent, status: EventStatus.CANCELLED };
      mockEventModel.findByIdAndUpdate.mockReturnValue({ exec: jest.fn().mockResolvedValue(cancelled) });
      const result = await service.cancel(eventId.toHexString());
      expect(result.status).toBe(EventStatus.CANCELLED);
      expect(mockEventModel.findByIdAndUpdate).toHaveBeenCalledWith(
        eventId.toHexString(),
        { status: EventStatus.CANCELLED },
        { new: true },
      );
    });

    it('throws EventNotFoundException when not found', async () => {
      mockEventModel.findByIdAndUpdate.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
      await expect(service.cancel('bad-id')).rejects.toThrow(EventNotFoundException);
    });
  });
});
