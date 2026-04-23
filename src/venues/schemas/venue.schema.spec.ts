import { VenueSchema } from './venue.schema';
import mongoose from 'mongoose';

const VenueModel = mongoose.model('VenueTest', VenueSchema);

describe('VenueSchema', () => {
  it('requires name', () => {
    const doc = new VenueModel({ address: 'KL', seatMap: [] });
    const err = doc.validateSync();
    expect(err?.errors['name']).toBeDefined();
  });

  it('requires address', () => {
    const doc = new VenueModel({ name: 'Arena', seatMap: [] });
    const err = doc.validateSync();
    expect(err?.errors['address']).toBeDefined();
  });

  it('accepts valid venue', () => {
    const doc = new VenueModel({
      name: 'Axiata Arena',
      address: 'Bukit Jalil, KL',
      seatMap: [{ section: 'A', row: '1', number: '1', priceTier: 'standard' }],
    });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('rejects invalid priceTier in seatMap', () => {
    const doc = new VenueModel({
      name: 'Arena',
      address: 'KL',
      seatMap: [{ section: 'A', row: '1', number: '1', priceTier: 'gold' }],
    });
    const err = doc.validateSync();
    expect(err?.errors['seatMap.0.priceTier']).toBeDefined();
  });
});
