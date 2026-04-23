# Architecture Decision Record

## Atomic seat reservation with Redis Lua

### Problem

A ticketing system must prevent double-booking. When multiple users attempt to hold the same seat concurrently, a naive "check then set" approach has a TOCTOU race condition: two requests can both observe a seat as free and both proceed to claim it.

### Solution

A single Lua script executed atomically by Redis handles multi-seat holds:

```lua
-- hold-seats.lua
for i = 1, #KEYS do
  if redis.call('EXISTS', KEYS[i]) == 1 then
    -- rollback all keys set earlier in this call
    for j = 1, i-1 do redis.call('DEL', KEYS[j]) end
    return 0
  end
  redis.call('SET', KEYS[i], ARGV[1], 'EX', ARGV[2])
end
return 1
```

**Key properties:**
- **Atomicity**: Redis executes Lua scripts without interruption — no other command can run between the `EXISTS` check and the `SET`.
- **All-or-nothing**: If seat #3 of 5 is already held, seats #1 and #2 that were just set are immediately deleted. The caller gets `0` and the client receives a 409.
- **TTL-based expiry**: Each key is set with `EX <ttl>`. Abandoned holds automatically expire; no background job required.
- **Key pattern**: `seat:hold:{eventId}:{seatId}` → one Redis key per seat, namespaced to prevent cross-event collisions.

### Why not optimistic locking in MongoDB?

MongoDB optimistic locking requires application-level version fields and retry loops. It doesn't prevent the race — it detects it after the fact and forces a retry. Redis Lua is a single network roundtrip that resolves the contention without retries.

### Concurrency proof

`test/seats.concurrency.spec.ts` starts a real Redis instance, fires 50 parallel `holdSeats` calls for the same seat, and asserts:

- Exactly 1 call returns success (`holdToken` set)
- 49 calls return `SeatAlreadyHeldException` (409)
- Redis contains exactly 1 key afterward

## MongoDB transaction strategy

Order confirmation (POST /orders) must atomically:

1. Create ticket documents
2. Create an order document
3. Stamp `orderId` on each ticket
4. Mark each seat as `BOOKED`

This is implemented with `session.withTransaction()`. Standalone MongoDB (local dev) does not support multi-document transactions; the service detects this error and falls back to sequential writes. MongoDB Atlas (production) always supports transactions.

## RFC 7807 error responses

All errors return `Content-Type: application/problem+json` with the shape:

```json
{
  "type": "about:blank",
  "title": "Conflict",
  "status": 409,
  "detail": "Seat is already held by another user",
  "instance": "/events/abc/seats/hold"
}
```

This is handled by `HttpExceptionFilter` which intercepts all `HttpException` subclasses.

## Price tier multipliers

Seat prices are computed at event creation time (not at hold time) to avoid price drift:

```
finalPrice = event.basePrice × PRICE_TIER_MULTIPLIER[seat.priceTier]
```

| Tier     | Multiplier |
|----------|-----------|
| standard | 1.0       |
| premium  | 1.5       |
| vip      | 2.0       |

Prices are stored on the `Seat` document and copied to `Ticket` at order confirmation.

## Seat status state machine

```
AVAILABLE → HELD (Redis only, no Mongo write) → AVAILABLE (release/TTL expiry)
                                               → BOOKED (order confirmed, persisted in Mongo)
```

MongoDB `Seat.status` only transitions to `BOOKED` — the `HELD` state is entirely ephemeral in Redis. This keeps MongoDB as the source of truth for permanent state while Redis provides fast, expiring lease management.
