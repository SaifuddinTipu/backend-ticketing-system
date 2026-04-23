import { TicketSchema, TicketStatus } from './ticket.schema';
import mongoose from 'mongoose';

const TicketModel = mongoose.model('TicketTest', TicketSchema);

describe('TicketSchema', () => {
  const validTicket = () => ({
    eventId: new mongoose.Types.ObjectId(),
    seatId: new mongoose.Types.ObjectId(),
    orderId: new mongoose.Types.ObjectId(),
    userId: 'user-123',
    section: 'A',
    row: '1',
    number: '1',
    price: 350,
    currency: 'MYR',
  });

  it('accepts a valid ticket', () => {
    const doc = new TicketModel(validTicket());
    expect(doc.validateSync()).toBeUndefined();
  });

  it('defaults status to active', () => {
    const doc = new TicketModel(validTicket());
    expect(doc.status).toBe(TicketStatus.ACTIVE);
  });

  it('requires userId', () => {
    const doc = new TicketModel({ ...validTicket(), userId: undefined });
    const err = doc.validateSync();
    expect(err?.errors['userId']).toBeDefined();
  });

  it('rejects invalid status', () => {
    const doc = new TicketModel({ ...validTicket(), status: 'refunded' });
    const err = doc.validateSync();
    expect(err?.errors['status']).toBeDefined();
  });
});
