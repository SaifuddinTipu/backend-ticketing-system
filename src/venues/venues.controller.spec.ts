import { Test, TestingModule } from '@nestjs/testing';
import { VenuesController } from './venues.controller';
import { VenuesService } from './venues.service';

const mockVenue = { _id: 'venue-id-1', name: 'Axiata Arena', address: 'KL', seatMap: [] };

const mockVenuesService = {
  create: jest.fn().mockResolvedValue(mockVenue),
  findAll: jest.fn().mockResolvedValue([mockVenue]),
  findOne: jest.fn().mockResolvedValue(mockVenue),
  update: jest.fn().mockResolvedValue({ ...mockVenue, name: 'Updated' }),
  remove: jest.fn().mockResolvedValue(undefined),
};

describe('VenuesController', () => {
  let controller: VenuesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VenuesController],
      providers: [{ provide: VenuesService, useValue: mockVenuesService }],
    }).compile();
    controller = module.get<VenuesController>(VenuesController);
    jest.clearAllMocks();
  });

  it('create calls service.create', async () => {
    mockVenuesService.create.mockResolvedValue(mockVenue);
    const result = await controller.create({ name: 'Axiata Arena', address: 'KL', seatMap: [] });
    expect(result).toEqual(mockVenue);
    expect(mockVenuesService.create).toHaveBeenCalledTimes(1);
  });

  it('findAll calls service.findAll', async () => {
    mockVenuesService.findAll.mockResolvedValue([mockVenue]);
    const result = await controller.findAll();
    expect(result).toEqual([mockVenue]);
  });

  it('findOne calls service.findOne with id', async () => {
    mockVenuesService.findOne.mockResolvedValue(mockVenue);
    const result = await controller.findOne('venue-id-1');
    expect(result).toEqual(mockVenue);
    expect(mockVenuesService.findOne).toHaveBeenCalledWith('venue-id-1');
  });

  it('update calls service.update with id and dto', async () => {
    const updated = { ...mockVenue, name: 'Updated' };
    mockVenuesService.update.mockResolvedValue(updated);
    const result = await controller.update('venue-id-1', { name: 'Updated' });
    expect(result).toEqual(updated);
    expect(mockVenuesService.update).toHaveBeenCalledWith('venue-id-1', { name: 'Updated' });
  });

  it('remove calls service.remove with id', async () => {
    mockVenuesService.remove.mockResolvedValue(undefined);
    await controller.remove('venue-id-1');
    expect(mockVenuesService.remove).toHaveBeenCalledWith('venue-id-1');
  });
});
