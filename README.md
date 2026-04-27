# Ticketing API

Backend ticketing system built with NestJS + TypeScript + MongoDB + Redis, containerised with Docker, deployed on GCP.

**Live deployment (GCE VM — asia-southeast2-b):**
- Health: http://34.128.124.240/health
- Swagger UI: http://34.128.124.240/api/docs

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

## GCP Deployment (GCE VM + Docker)

All infrastructure runs inside GCP — no third-party services needed.
MongoDB and Redis run as Docker containers on the same VM alongside the API.

**Zone used:** `asia-southeast2-b` (Jakarta — closest to Malaysia)
**Project used:** `airasia-ticketing`

---

### Step 1 — One-time setup

```bash
export PROJECT_ID=airasia-ticketing
export ZONE=asia-southeast2-b
export REGION=asia-southeast2
export IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/ticketing-api/ticketing-api"

gcloud config set project $PROJECT_ID

# Enable APIs (only needed once)
gcloud services enable artifactregistry.googleapis.com compute.googleapis.com
```

---

### Step 2 — Create Artifact Registry repository (only needed once)

```bash
gcloud artifacts repositories create ticketing-api \
  --repository-format=docker \
  --location=$REGION \
  --description="Ticketing API Docker images"
```

---

### Step 3 — Build, tag, and push the image

Run this from the `ticketing-api/` folder every time you want to deploy a new version.

```bash
# Authenticate Docker to push to GCP
gcloud auth configure-docker ${REGION}-docker.pkg.dev

# Build and push (tag with git short SHA for versioning)
export TAG=$(git rev-parse --short HEAD)
docker build -t ${IMAGE}:${TAG} -t ${IMAGE}:latest .
docker push ${IMAGE}:${TAG}
docker push ${IMAGE}:latest

echo "Pushed: ${IMAGE}:${TAG}"
```

---

### Step 4 — Create the VM (only needed once)

COS (Container-Optimized OS) uses `docker-credential-gcr` instead of `gcloud`
to authenticate against Artifact Registry.

```bash
gcloud compute instances create ticketing-vm \
  --zone=$ZONE \
  --machine-type=e2-small \
  --image-family=cos-stable \
  --image-project=cos-cloud \
  --tags=http-server \
  --scopes=cloud-platform \
  --metadata=startup-script="#! /bin/bash
docker-credential-gcr configure-docker \
  --registries=${REGION}-docker.pkg.dev
docker pull ${IMAGE}:latest
docker pull mongo:7
docker pull redis:7-alpine
docker network create app
docker run -d --name mongo --network app -v mongo_data:/data/db mongo:7
docker run -d --name redis --network app redis:7-alpine
sleep 10
docker run -d --name api --network app \
  -p 80:8080 \
  -e NODE_ENV=production \
  -e MONGO_URI=mongodb://mongo:27017/ticketing \
  -e REDIS_URL=redis://redis:6379 \
  -e SEAT_HOLD_TTL_SECONDS=600 \
  ${IMAGE}:latest"

# Allow HTTP on port 80
gcloud compute firewall-rules create allow-http \
  --allow=tcp:80 \
  --target-tags=http-server \
  --project=$PROJECT_ID 2>/dev/null || echo "Firewall rule already exists"
```

---

### Step 5 — Verify the deployment

```bash
export VM_IP=$(gcloud compute instances describe ticketing-vm \
  --zone=$ZONE \
  --format="value(networkInterfaces[0].accessConfigs[0].natIP)")

echo "VM IP: $VM_IP"

# Wait ~60 seconds for startup script to finish, then:
curl http://${VM_IP}/health
# → {"status":"ok"}

echo "Swagger UI: http://${VM_IP}/api/docs"
```

---

### Redeploying a new version (CI/CD update flow)

When you push new code, run steps 3 + this redeploy command:

```bash
export TAG=$(git rev-parse --short HEAD)

# SSH into the VM and restart the API container with the new image
gcloud compute ssh ticketing-vm --zone=$ZONE --command="
  docker pull ${IMAGE}:latest
  docker stop api && docker rm api
  docker run -d --name api --network app \
    -p 80:8080 \
    -e NODE_ENV=production \
    -e MONGO_URI=mongodb://mongo:27017/ticketing \
    -e REDIS_URL=redis://redis:6379 \
    -e SEAT_HOLD_TTL_SECONDS=600 \
    ${IMAGE}:latest
  echo 'Deployed ${IMAGE}:latest'
"
```

Only the API container is restarted — MongoDB and Redis keep their data.

---

### Check VM logs (debugging)

```bash
# Stream all container logs
gcloud compute ssh ticketing-vm --zone=$ZONE --command="docker logs api --tail=50 -f"

# Check startup script output
gcloud compute instances get-serial-port-output ticketing-vm --zone=$ZONE | tail -40
```

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
