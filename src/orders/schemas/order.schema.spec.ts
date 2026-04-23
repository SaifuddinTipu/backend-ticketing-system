import { OrderSchema, OrderStatus } from './order.schema';
import mongoose from 'mongoose';

const OrderModel = mongoose.model('OrderTest', OrderSchema);

describe('OrderSchema', () => {
  const validOrder = () => ({
    userId: 'user-123',
    eventId: new mongoose.Types.ObjectId(),
    totalAmount: 700,
    currency: 'MYR',
  });

  it('accepts a valid order', () => {
    const doc = new OrderModel(validOrder());
    expect(doc.validateSync()).toBeUndefined();
  });

  it('defaults status to confirmed', () => {
    const doc = new OrderModel(validOrder());
    expect(doc.status).toBe(OrderStatus.CONFIRMED);
  });

  it('requires userId', () => {
    const doc = new OrderModel({ ...validOrder(), userId: undefined });
    const err = doc.validateSync();
    expect(err?.errors['userId']).toBeDefined();
  });

  it('requires totalAmount', () => {
    const doc = new OrderModel({ ...validOrder(), totalAmount: undefined });
    const err = doc.validateSync();
    expect(err?.errors['totalAmount']).toBeDefined();
  });
});
