# Ticketing API

Backend ticketing system built with NestJS + TypeScript + MongoDB + Redis, containerised with Docker, deployable to GCP Cloud Run.

## Architecture overview

```
┌─────────────────────────────────────────────────────────┐
│  Client (HTTP)                                          │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│  NestJS API (Cloud Run, port 8080)                      │
│  ┌────────────┐  ┌────────────┐  ┌────────────────────┐ │
│  │  Venues    │  │  Events    │  │  Seats             │ │
│  │  Controller│  │  Controller│  │  Controller        │ │
│  └─────┬──────┘  └─────┬──────┘  └────────┬───────────┘ │
│        │               │                  │             │
│  ┌─────▼──────┐  ┌─────▼──────┐  ┌────────▼──────────┐ │
│  │  Venues    │  │  Events    │  │  Seats Service     │ │
│  │  Service   │  │  Service   │  │  (Lua atomic hold) │ │
│  └─────┬──────┘  └─────┬──────┘  └────────┬───────────┘ │
│        │               │                  │             │
│  ┌─────▼───────────────▼──────────────────▼──────────┐ │
│  │  MongoDB (Mongoose)          Redis (ioredis)       │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Redis seat-hold design

Seat holds are stored as `seat:hold:{eventId}:{seatId}` keys in Redis with a configurable TTL (default 600 s).

A **Lua script** (`src/seats/scripts/hold-seats.lua`) ensures atomic all-or-nothing multi-seat reservation:

```lua
for i = 1, #KEYS do
  if redis.call('EXISTS', KEYS[i]) == 1 then
    for j = 1, i-1 do redis.call('DEL', KEYS[j]) end
    return 0
  end
  redis.call('SET', KEYS[i], ARGV[1], 'EX', ARGV[2])
end
return 1
```

If *any* seat is already held, all previously-set keys in that same call are rolled back and `0` is returned — guaranteeing no partial holds. This is proven by `test/seats.concurrency.spec.ts` which fires 50 parallel hold requests and asserts exactly 1 succeeds.

### Price tiers

| Tier     | Multiplier | Example (basePrice=100) |
|----------|-----------|-------------------------|
| standard | 1.0×      | MYR 100                 |
| premium  | 1.5×      | MYR 150                 |
| vip      | 2.0×      | MYR 200                 |

## Local development (Docker Compose)

```bash
# Start API + MongoDB + Redis
docker compose up --build

# Health check
curl http://localhost:3000/health
# → {"status":"ok"}

# Swagger UI
open http://localhost:3000/api/docs
```

## Local development (without Docker)

Prerequisites: Node 22, MongoDB running locally, Redis running locally.

```bash
npm install

# Set env vars (or create .env)
export MONGO_URI=mongodb://localhost:27017/ticketing
export REDIS_URL=redis://localhost:6379
export SEAT_HOLD_TTL_SECONDS=300

npm run start:dev
```

## Environment variables

| Variable               | Required | Default     | Description                          |
|------------------------|----------|-------------|--------------------------------------|
| `MONGO_URI`            | yes      | —           | MongoDB connection string            |
| `REDIS_URL`            | yes      | —           | Redis connection string              |
| `PORT`                 | no       | `8080`      | HTTP listener port                   |
| `SEAT_HOLD_TTL_SECONDS`| no       | `600`       | Seat hold TTL in seconds             |
| `NODE_ENV`             | no       | `development`| Runtime environment                 |

## Tests

```bash
# Unit tests
npm run test

# Unit tests with coverage (target: >85%)
npm run test:cov

# E2E tests (requires live Mongo + Redis)
npm run test:e2e

# Concurrency test (50 parallel holds → exactly 1 succeeds)
npm run test:concurrency
```

Coverage: **94.55% statements / 94.73% lines** (91 unit tests, 31 e2e tests).

## GCP Cloud Run deployment

### Prerequisites

```bash
# Install gcloud CLI and authenticate
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# Enable required APIs
gcloud services enable run.googleapis.com artifactregistry.googleapis.com
```

### 1. Create Artifact Registry repository

```bash
gcloud artifacts repositories create ticketing-api \
  --repository-format=docker \
  --location=asia-southeast1 \
  --description="Ticketing API Docker images"
```

### 2. Build and push image

```bash
export PROJECT_ID=$(gcloud config get-value project)
export REGION=asia-southeast1
export IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/ticketing-api/ticketing-api:latest"

gcloud auth configure-docker ${REGION}-docker.pkg.dev

docker build -t $IMAGE .
docker push $IMAGE
```

### 3. Deploy to Cloud Run

```bash
gcloud run deploy ticketing-api \
  --image=$IMAGE \
  --region=$REGION \
  --platform=managed \
  --allow-unauthenticated \
  --port=8080 \
  --min-instances=0 \
  --max-instances=10 \
  --memory=512Mi \
  --cpu=1 \
  --set-env-vars="NODE_ENV=production" \
  --set-env-vars="MONGO_URI=YOUR_ATLAS_CONNECTION_STRING" \
  --set-env-vars="REDIS_URL=YOUR_UPSTASH_REDIS_URL" \
  --set-env-vars="SEAT_HOLD_TTL_SECONDS=600"
```

### 4. Verify deployment

```bash
SERVICE_URL=$(gcloud run services describe ticketing-api \
  --region=$REGION \
  --format="value(status.url)")

curl ${SERVICE_URL}/health
# → {"status":"ok"}
```

### Recommended managed services (free tier)

- **MongoDB**: [MongoDB Atlas M0](https://www.mongodb.com/cloud/atlas) — free 512 MB cluster
- **Redis**: [Upstash Redis](https://upstash.com/) — free 10K commands/day

## API quick-start (cURL examples)

Replace `BASE_URL` with your Cloud Run URL or `http://localhost:3000`.

```bash
export BASE_URL=http://localhost:3000
```

### Create a venue

```bash
curl -s -X POST $BASE_URL/venues \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Arena KL",
    "address": "Kuala Lumpur",
    "seatMap": [
      {"section": "A", "row": "1", "number": "1", "priceTier": "standard"},
      {"section": "A", "row": "1", "number": "2", "priceTier": "vip"}
    ]
  }' | jq .
```

### List venues

```bash
curl -s $BASE_URL/venues | jq .
```

### Create an event

```bash
export VENUE_ID=<venueId from above>

curl -s -X POST $BASE_URL/events \
  -H 'Content-Type: application/json' \
  -d "{
    \"name\": \"Rock Night\",
    \"venueId\": \"$VENUE_ID\",
    \"startAt\": \"2026-08-15T20:00:00.000Z\",
    \"endAt\": \"2026-08-15T23:30:00.000Z\",
    \"basePrice\": 100,
    \"currency\": \"MYR\"
  }" | jq .
```

### Publish an event

```bash
export EVENT_ID=<eventId from above>

curl -s -X PATCH $BASE_URL/events/$EVENT_ID \
  -H 'Content-Type: application/json' \
  -d '{"status": "published"}' | jq .
```

### View seat map

```bash
curl -s $BASE_URL/events/$EVENT_ID/seats | jq .
```

### Hold seats

```bash
export SEAT_IDS=$(curl -s $BASE_URL/events/$EVENT_ID/seats | jq -r '[.seats[].id] | @json')

curl -s -X POST $BASE_URL/events/$EVENT_ID/seats/hold \
  -H 'Content-Type: application/json' \
  -H 'x-user-id: user-001' \
  -d "{\"seatIds\": $SEAT_IDS}" | jq .
```

### Release seats

```bash
curl -s -X POST $BASE_URL/events/$EVENT_ID/seats/release \
  -H 'Content-Type: application/json' \
  -H 'x-user-id: user-001' \
  -d "{\"seatIds\": $SEAT_IDS}" | jq .
```

### Confirm order (hold seats first)

```bash
curl -s -X POST $BASE_URL/orders \
  -H 'Content-Type: application/json' \
  -H 'x-user-id: user-001' \
  -d "{\"seatIds\": $SEAT_IDS}" | jq .
```

### Get order

```bash
export ORDER_ID=<orderId from above>
curl -s $BASE_URL/orders/$ORDER_ID | jq .
```

### List my orders

```bash
curl -s $BASE_URL/orders \
  -H 'x-user-id: user-001' | jq .
```

### Get ticket

```bash
export TICKET_ID=<ticketId from order response>
curl -s $BASE_URL/tickets/$TICKET_ID | jq .
```

### Health check

```bash
curl -s $BASE_URL/health | jq .
```

## OpenAPI specification

The full OpenAPI 3.1 spec is at [`docs/openapi.yaml`](docs/openapi.yaml).

Interactive docs (Swagger UI) available at `/api/docs` when the server is running.

## Project structure

```
src/
├── common/
│   ├── exceptions/     # RFC 7807 domain exceptions
│   ├── filters/        # HttpExceptionFilter (problem+json)
│   └── redis/          # Redis + Lua script providers
├── config/             # Joi env validation
├── events/             # Events CRUD + seat generation
├── health/             # GET /health
├── orders/             # Order confirmation (MongoDB transaction)
├── seats/
│   ├── scripts/        # hold-seats.lua (atomic Lua script)
│   └── ...             # Seat map + hold/release logic
├── tickets/            # Ticket read endpoints
└── venues/             # Venue CRUD
test/
├── app.e2e-spec.ts     # 31 full happy-path e2e tests
└── seats.concurrency.spec.ts  # 50-parallel hold stress test
```
