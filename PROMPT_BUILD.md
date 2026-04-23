# How this project was built

This project was built as part of a Senior Software Engineer technical assessment for AirAsia MOVE, using Claude Code (Anthropic's AI coding assistant) with explicit phase-by-phase approval gates.

## Approach

The implementation followed a 10-phase plan:

1. **Project scaffold** — NestJS 11, TypeScript strict, Joi env validation, Swagger, RFC 7807 filter
2. **Data layer** — Mongoose schemas for Venue, Event, Seat, Ticket, Order with indexes
3. **Venues module** — CRUD with seat map definition
4. **Events module** — CRUD with automatic seat generation from venue seatMap
5. **Seats module** — Redis-backed seat map, atomic Lua hold script, release endpoint
6. **Orders module** — MongoDB transaction confirmation, ticket embedding
7. **Testing** — 91 unit tests (94.55% coverage), 31 e2e tests, concurrency test
8. **Containerisation** — Multi-stage Dockerfile, docker-compose with healthchecks
9. **Cloud Run** — Deployment instructions in README
10. **Documentation** — README, ARCHITECTURE.md, OpenAPI 3.1 spec

## Key design decisions made during implementation

- **Lua script over `defineCommand`**: ioredis's `defineCommand` with `numberOfKeys: -1` passes `-1` literally to EVAL, causing Redis errors. Switched to `redis.eval(script, keys.length, ...keys, ...args)` directly.

- **Lua script as injectable token**: Rather than reading the file inline in SeatsService, the Lua script string is provided via `LUA_HOLD_SEATS` injection token — making the service fully testable without file I/O in unit tests.

- **`ordered: true` for multi-doc session writes**: `ticketModel.create(docs, { session })` with multiple documents requires `ordered: true` in Mongoose — not documented prominently but enforced at runtime.

- **`toObject()` for Mongoose document serialization**: `Object.assign(mongooseDoc, { tickets })` does not include dynamically assigned properties in `toJSON()`. Fixed by returning `{ ...order.toObject(), tickets: tickets.map(t => t.toObject()) }`.

- **Ticket `orderId` optional**: Tickets are created first (inside the transaction), then the order is created, then `orderId` is stamped back via `updateMany`. The schema must allow `orderId` to be absent at creation time.

- **Coverage exclusions**: `main.ts`, `*.module.ts`, and `env.validation.ts` are excluded from coverage because they contain NestJS metadata/bootstrap code that cannot be meaningfully unit-tested. This brought coverage from a misleading 79.5% to an accurate 94.55%.

- **Jest `rootDir` fix**: Jest's default `rootDir: "src"` excluded the `test/` directory. Changed to `rootDir: "."` with `roots: ["<rootDir>/src", "<rootDir>/test"]` to pick up both unit specs and the concurrency test.

- **Lua file in `dist` via `nest-cli.json` assets**: NestJS only copies `.ts`/`.js` files during build. Added `assets` config to `nest-cli.json` to copy `seats/scripts/*.lua` into `dist/seats/scripts/` automatically.
