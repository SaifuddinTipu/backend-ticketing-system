import { SeatSchema, SeatStatus, PriceTier } from './seat.schema';
import mongoose from 'mongoose';

const SeatModel = mongoose.model('SeatTest', SeatSchema);

describe('SeatSchema', () => {
  const validSeat = () => ({
    eventId: new mongoose.Types.ObjectId(),
    section: 'A',
    row: '1',
    number: '1',
    priceTier: PriceTier.STANDARD,
    price: 350,
  });

  it('accepts a valid seat', () => {
    const doc = new SeatModel(validSeat());
    expect(doc.validateSync()).toBeUndefined();
  });

  it('defaults status to available', () => {
    const doc = new SeatModel(validSeat());
    expect(doc.status).toBe(SeatStatus.AVAILABLE);
  });

  it('requires eventId', () => {
    const doc = new SeatModel({ ...validSeat(), eventId: undefined });
    const err = doc.validateSync();
    expect(err?.errors['eventId']).toBeDefined();
  });

  it('rejects invalid priceTier', () => {
    const doc = new SeatModel({ ...validSeat(), priceTier: 'gold' });
    const err = doc.validateSync();
    expect(err?.errors['priceTier']).toBeDefined();
  });

  it('rejects invalid status', () => {
    const doc = new SeatModel({ ...validSeat(), status: 'reserved' });
    const err = doc.validateSync();
    expect(err?.errors['status']).toBeDefined();
  });
});
