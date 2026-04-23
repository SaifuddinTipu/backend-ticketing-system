/**
 * E2E happy-path test.
 * Requires: MONGO_URI and REDIS_URL env vars pointing to live instances.
 * Run with: npm run test:e2e
 *
 * Flow: create venue → create event → view seats → hold seats → release →
 *       re-hold → confirm order → get order → get ticket → health
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import mongoose from 'mongoose';
import Redis from 'ioredis';

const MONGO_URI = process.env.MONGO_URI ?? 'mongodb://localhost:27017/ticketing-e2e';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

describe('Ticketing API (e2e)', () => {
  let app: INestApplication;
  let redis: Redis;

  let venueId: string;
  let eventId: string;
  let seatIds: string[];
  let orderId: string;
  let ticketId: string;

  const USER_ID = 'e2e-user-001';

  beforeAll(async () => {
    process.env.MONGO_URI = MONGO_URI;
    process.env.REDIS_URL = REDIS_URL;
    process.env.SEAT_HOLD_TTL_SECONDS = '60';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    redis = new Redis(REDIS_URL);
  });

  afterAll(async () => {
    const conn = mongoose.connection;
    if (conn.readyState === 1) {
      await conn.db?.dropDatabase();
    }
    await redis.flushdb();
    redis.disconnect();
    await app.close();
  });

  // ── Health ────────────────────────────────────────────────────────────────
  it('GET /health → 200 { status: ok }', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  // ── Venues ────────────────────────────────────────────────────────────────
  it('POST /venues → 201 with seatMap', async () => {
    const res = await request(app.getHttpServer())
      .post('/venues')
      .send({
        name: 'E2E Arena',
        address: 'Test City',
        seatMap: [
          { section: 'A', row: '1', number: '1', priceTier: 'standard' },
          { section: 'A', row: '1', number: '2', priceTier: 'vip' },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body._id).toBeDefined();
    venueId = res.body._id;
  });

  it('GET /venues → 200 list', async () => {
    const res = await request(app.getHttpServer()).get('/venues');
    expect(res.status).toBe(200);
    expect(res.body.some((v: { _id: string }) => v._id === venueId)).toBe(true);
  });

  it('GET /venues/:id → 200', async () => {
    const res = await request(app.getHttpServer()).get(`/venues/${venueId}`);
    expect(res.status).toBe(200);
    expect(res.body._id).toBe(venueId);
  });

  it('PATCH /venues/:id → 200 updated name', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/venues/${venueId}`)
      .send({ name: 'E2E Arena Updated' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('E2E Arena Updated');
  });

  // ── Events ────────────────────────────────────────────────────────────────
  it('POST /events → 201 and generates seats from venue seatMap', async () => {
    const res = await request(app.getHttpServer())
      .post('/events')
      .send({
        name: 'E2E Concert',
        venueId,
        startAt: '2026-08-15T20:00:00.000Z',
        endAt: '2026-08-15T23:30:00.000Z',
        basePrice: 100,
        currency: 'MYR',
      });
    expect(res.status).toBe(201);
    expect(res.body._id).toBeDefined();
    expect(res.body.status).toBe('draft');
    eventId = res.body._id;
  });

  it('GET /events → 200 paginated', async () => {
    const res = await request(app.getHttpServer()).get('/events?page=1&limit=10');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
  });

  it('GET /events?status=draft → filtered results', async () => {
    const res = await request(app.getHttpServer()).get('/events?status=draft');
    expect(res.status).toBe(200);
    expect(res.body.data.every((e: { status: string }) => e.status === 'draft')).toBe(true);
  });

  it('GET /events/:id → 200', async () => {
    const res = await request(app.getHttpServer()).get(`/events/${eventId}`);
    expect(res.status).toBe(200);
    expect(res.body._id).toBe(eventId);
  });

  it('PATCH /events/:id → 200 status published', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/events/${eventId}`)
      .send({ status: 'published' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('published');
  });

  // ── Seat Map ──────────────────────────────────────────────────────────────
  it('GET /events/:id/seats → 200 with 2 seats all available', async () => {
    const res = await request(app.getHttpServer()).get(`/events/${eventId}/seats`);
    expect(res.status).toBe(200);
    expect(res.body.seats).toHaveLength(2);
    expect(res.body.summary.total).toBe(2);
    expect(res.body.summary.available).toBe(2);
    seatIds = res.body.seats.map((s: { _id: string }) => s._id);
  });

  // ── Hold Seats ────────────────────────────────────────────────────────────
  it('POST /events/:id/seats/hold → 201 with holdToken and expiresAt', async () => {
    const res = await request(app.getHttpServer())
      .post(`/events/${eventId}/seats/hold`)
      .set('x-user-id', USER_ID)
      .send({ seatIds });
    expect(res.status).toBe(201);
    expect(res.body.holdToken).toMatch(/^hold_/);
    expect(new Date(res.body.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('GET /events/:id/seats → held=2 after hold', async () => {
    const res = await request(app.getHttpServer()).get(`/events/${eventId}/seats`);
    expect(res.body.summary.held).toBe(2);
    expect(res.body.summary.available).toBe(0);
  });

  it('POST hold by another user → 409 Conflict (RFC 7807)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/events/${eventId}/seats/hold`)
      .set('x-user-id', 'intruder-user')
      .send({ seatIds: [seatIds[0]] });
    expect(res.status).toBe(409);
    expect(res.body.type).toBe('about:blank');
    expect(res.body.status).toBe(409);
  });

  // ── Release ───────────────────────────────────────────────────────────────
  it('POST release by wrong user → 403', async () => {
    const res = await request(app.getHttpServer())
      .post(`/events/${eventId}/seats/release`)
      .set('x-user-id', 'wrong-user')
      .send({ seatIds: [seatIds[0]] });
    expect(res.status).toBe(403);
  });

  it('POST release by correct user → 200', async () => {
    const res = await request(app.getHttpServer())
      .post(`/events/${eventId}/seats/release`)
      .set('x-user-id', USER_ID)
      .send({ seatIds });
    expect(res.status).toBe(200);
    expect(res.body.released).toHaveLength(2);
  });

  it('GET /events/:id/seats → available=2 after release', async () => {
    const res = await request(app.getHttpServer()).get(`/events/${eventId}/seats`);
    expect(res.body.summary.available).toBe(2);
    expect(res.body.summary.held).toBe(0);
  });

  // ── Re-hold + Order ───────────────────────────────────────────────────────
  it('Re-hold seats before confirming order', async () => {
    const res = await request(app.getHttpServer())
      .post(`/events/${eventId}/seats/hold`)
      .set('x-user-id', USER_ID)
      .send({ seatIds });
    expect(res.status).toBe(201);
  });

  it('POST /orders → 201 confirmed with embedded tickets', async () => {
    const res = await request(app.getHttpServer())
      .post('/orders')
      .set('x-user-id', USER_ID)
      .send({ seatIds });
    if (res.status !== 201) console.error('ORDER 500 body:', JSON.stringify(res.body));
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('confirmed');
    expect(res.body.totalAmount).toBe(300); // 100 standard + 200 vip (100*2)
    expect(res.body.tickets).toHaveLength(2);
    orderId = res.body._id;
    ticketId = res.body.tickets[0]._id;
  });

  it('POST /orders again with same seats → 403 (holds deleted)', async () => {
    const res = await request(app.getHttpServer())
      .post('/orders')
      .set('x-user-id', USER_ID)
      .send({ seatIds });
    expect(res.status).toBe(403);
  });

  it('GET /events/:id/seats → booked=2 after order', async () => {
    const res = await request(app.getHttpServer()).get(`/events/${eventId}/seats`);
    expect(res.body.summary.booked).toBe(2);
    expect(res.body.summary.available).toBe(0);
  });

  // ── Order & Ticket reads ──────────────────────────────────────────────────
  it('GET /orders/:id → 200', async () => {
    const res = await request(app.getHttpServer()).get(`/orders/${orderId}`);
    expect(res.status).toBe(200);
    expect(res.body._id).toBe(orderId);
  });

  it('GET /orders (with x-user-id) → 200 includes our order', async () => {
    const res = await request(app.getHttpServer())
      .get('/orders')
      .set('x-user-id', USER_ID);
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
  });

  it('GET /tickets/:id → 200 active ticket', async () => {
    const res = await request(app.getHttpServer()).get(`/tickets/${ticketId}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');
    expect(res.body.userId).toBe(USER_ID);
  });

  // ── Cancel Event ──────────────────────────────────────────────────────────
  it('DELETE /events/:id → 200 status cancelled', async () => {
    const res2 = await request(app.getHttpServer())
      .post('/events')
      .send({ name: 'To Cancel', venueId, startAt: '2026-09-01T10:00:00Z', endAt: '2026-09-01T12:00:00Z', basePrice: 50, currency: 'MYR' });
    const eid = res2.body._id;
    const res = await request(app.getHttpServer()).delete(`/events/${eid}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');
  });

  // ── 404 & validation ──────────────────────────────────────────────────────
  it('GET /venues/000000000000000000000000 → 404 problem+json', async () => {
    const res = await request(app.getHttpServer()).get('/venues/000000000000000000000000');
    expect(res.status).toBe(404);
    expect(res.body.type).toBe('about:blank');
  });

  it('GET /orders/000000000000000000000000 → 404 problem+json', async () => {
    const res = await request(app.getHttpServer()).get('/orders/000000000000000000000000');
    expect(res.status).toBe(404);
    expect(res.body.type).toBe('about:blank');
  });

  it('GET /tickets/000000000000000000000000 → 404 problem+json', async () => {
    const res = await request(app.getHttpServer()).get('/tickets/000000000000000000000000');
    expect(res.status).toBe(404);
    expect(res.body.type).toBe('about:blank');
  });

  it('POST /venues with missing fields → 400', async () => {
    const res = await request(app.getHttpServer()).post('/venues').send({});
    expect(res.status).toBe(400);
  });

  it('POST /events/:id/seats/hold with empty seatIds → 400', async () => {
    const res = await request(app.getHttpServer())
      .post(`/events/${eventId}/seats/hold`)
      .set('x-user-id', USER_ID)
      .send({ seatIds: [] });
    expect(res.status).toBe(400);
  });

  it('DELETE /venues/:id → 204', async () => {
    const v = await request(app.getHttpServer())
      .post('/venues')
      .send({ name: 'To Delete', address: 'X', seatMap: [] });
    const vid = v.body._id;
    const res = await request(app.getHttpServer()).delete(`/venues/${vid}`);
    expect(res.status).toBe(204);
  });
});
