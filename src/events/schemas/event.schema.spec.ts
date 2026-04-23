import { EventSchema, EventStatus } from './event.schema';
import mongoose from 'mongoose';

const EventModel = mongoose.model('EventTest', EventSchema);

describe('EventSchema', () => {
  it('requires name', () => {
    const doc = new EventModel({
      venueId: new mongoose.Types.ObjectId(),
      startAt: new Date(),
      endAt: new Date(),
      basePrice: 100,
    });
    const err = doc.validateSync();
    expect(err?.errors['name']).toBeDefined();
  });

  it('requires venueId', () => {
    const doc = new EventModel({
      name: 'Concert',
      startAt: new Date(),
      endAt: new Date(),
      basePrice: 100,
    });
    const err = doc.validateSync();
    expect(err?.errors['venueId']).toBeDefined();
  });

  it('defaults status to draft', () => {
    const doc = new EventModel({
      name: 'Concert',
      venueId: new mongoose.Types.ObjectId(),
      startAt: new Date(),
      endAt: new Date(),
      basePrice: 100,
      currency: 'MYR',
    });
    expect(doc.status).toBe(EventStatus.DRAFT);
  });

  it('rejects invalid status', () => {
    const doc = new EventModel({
      name: 'Concert',
      venueId: new mongoose.Types.ObjectId(),
      startAt: new Date(),
      endAt: new Date(),
      basePrice: 100,
      status: 'unknown',
    });
    const err = doc.validateSync();
    expect(err?.errors['status']).toBeDefined();
  });
});
