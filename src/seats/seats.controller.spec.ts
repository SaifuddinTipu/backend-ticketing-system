import { Test, TestingModule } from '@nestjs/testing';
import { SeatsController } from './seats.controller';
import { SeatsService } from './seats.service';
import { SeatStatus } from './schemas/seat.schema';

const mockSeatsService = {
  getSeatMap: jest.fn(),
  holdSeats: jest.fn(),
  releaseSeats: jest.fn(),
};

describe('SeatsController', () => {
  let controller: SeatsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SeatsController],
      providers: [{ provide: SeatsService, useValue: mockSeatsService }],
    }).compile();
    controller = module.get<SeatsController>(SeatsController);
    jest.clearAllMocks();
  });

  it('getSeatMap delegates to service', async () => {
    const response = { eventId: 'eid', seats: [], summary: { total: 0, available: 0, held: 0, booked: 0 } };
    mockSeatsService.getSeatMap.mockResolvedValue(response);
    const result = await controller.getSeatMap('eid');
    expect(result).toEqual(response);
    expect(mockSeatsService.getSeatMap).toHaveBeenCalledWith('eid');
  });

  it('holdSeats delegates with correct args', async () => {
    const response = { holdToken: 'hold_u1_123', seatIds: ['s1'], expiresAt: new Date() };
    mockSeatsService.holdSeats.mockResolvedValue(response);
    const result = await controller.holdSeats('eid', { seatIds: ['s1'] }, 'user-1');
    expect(result).toEqual(response);
    expect(mockSeatsService.holdSeats).toHaveBeenCalledWith('eid', ['s1'], 'user-1');
  });

  it('releaseSeats delegates with correct args', async () => {
    const response = { released: ['s1'] };
    mockSeatsService.releaseSeats.mockResolvedValue(response);
    const result = await controller.releaseSeats('eid', { seatIds: ['s1'] }, 'user-1');
    expect(result).toEqual(response);
    expect(mockSeatsService.releaseSeats).toHaveBeenCalledWith('eid', ['s1'], 'user-1');
  });
});
