import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { VenuesService } from './venues.service';
import { Venue } from './schemas/venue.schema';
import { VenueNotFoundException } from '../common/exceptions/domain.exceptions';

const mockVenue = {
  _id: 'venue-id-1',
  name: 'Axiata Arena',
  address: 'Bukit Jalil, KL',
  seatMap: [],
};

const mockVenueModel = {
  create: jest.fn(),
  find: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findByIdAndDelete: jest.fn(),
};

describe('VenuesService', () => {
  let service: VenuesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VenuesService,
        { provide: getModelToken(Venue.name), useValue: mockVenueModel },
      ],
    }).compile();
    service = module.get<VenuesService>(VenuesService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('creates and returns a venue', async () => {
      mockVenueModel.create.mockResolvedValue(mockVenue);
      const result = await service.create({ name: 'Axiata Arena', address: 'KL', seatMap: [] });
      expect(result).toEqual(mockVenue);
      expect(mockVenueModel.create).toHaveBeenCalledWith({ name: 'Axiata Arena', address: 'KL', seatMap: [] });
    });
  });

  describe('findAll', () => {
    it('returns all venues', async () => {
      mockVenueModel.find.mockReturnValue({ exec: jest.fn().mockResolvedValue([mockVenue]) });
      const result = await service.findAll();
      expect(result).toEqual([mockVenue]);
    });
  });

  describe('findOne', () => {
    it('returns a venue when found', async () => {
      mockVenueModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(mockVenue) });
      const result = await service.findOne('venue-id-1');
      expect(result).toEqual(mockVenue);
    });

    it('throws VenueNotFoundException when not found', async () => {
      mockVenueModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
      await expect(service.findOne('bad-id')).rejects.toThrow(VenueNotFoundException);
    });
  });

  describe('update', () => {
    it('updates and returns the venue', async () => {
      const updated = { ...mockVenue, name: 'New Name' };
      mockVenueModel.findByIdAndUpdate.mockReturnValue({ exec: jest.fn().mockResolvedValue(updated) });
      const result = await service.update('venue-id-1', { name: 'New Name' });
      expect(result).toEqual(updated);
    });

    it('throws VenueNotFoundException when venue not found', async () => {
      mockVenueModel.findByIdAndUpdate.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
      await expect(service.update('bad-id', { name: 'X' })).rejects.toThrow(VenueNotFoundException);
    });
  });

  describe('remove', () => {
    it('deletes the venue', async () => {
      mockVenueModel.findByIdAndDelete.mockReturnValue({ exec: jest.fn().mockResolvedValue(mockVenue) });
      await expect(service.remove('venue-id-1')).resolves.toBeUndefined();
    });

    it('throws VenueNotFoundException when not found', async () => {
      mockVenueModel.findByIdAndDelete.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
      await expect(service.remove('bad-id')).rejects.toThrow(VenueNotFoundException);
    });
  });
});
