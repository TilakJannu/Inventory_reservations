# Allo Inventory Reservations

Production-grade take-home implementation for checkout-time inventory holds across multiple warehouses.

## What It Does

- Lists products with available stock per warehouse.
- Creates short-lived pending reservations during checkout.
- Confirms reservations after simulated payment success.
- Releases reservations after cancellation, failure, or expiry.
- Prevents overselling with an atomic Postgres update on the inventory row.
- Surfaces `409 Conflict` and `410 Gone` errors in the UI.

## Stack

- Next.js App Router and React
- TypeScript in strict mode
- Prisma with hosted Postgres
- Redis for idempotency, via either `REDIS_URL` or Upstash REST
- Zod validation
- Tailwind CSS with local shadcn/ui-style components
- Vitest unit tests
- ESLint
- Vercel-compatible cron endpoint for expiry cleanup

## Architecture

The app separates concerns by layer:

- `src/app`: Next.js pages and route handlers.
- `src/features`: client-side feature modules, components, API clients, and UI types.
- `src/server/features`: server-side domain services, DTOs, validation, and policies.
- `src/server/http`: API response envelopes, errors, and rate limiting.
- `src/server/db`: Prisma client lifecycle.
- `src/server/redis`: Upstash Redis client lifecycle.
- `src/components/ui`: shadcn/ui-style primitives built on Tailwind CSS.
- `prisma`: schema, migration, and seed data.

Route handlers stay thin. They parse input, apply rate limits, call services, and map errors to consistent JSON envelopes. Business rules live in services and domain policy modules.

## Inventory Model

`InventoryStock` stores stock for one product at one warehouse:

- `totalUnits`: physical units that are still sellable.
- `reservedUnits`: units currently held by pending reservations.
- available stock is `totalUnits - reservedUnits`.

`Reservation` records the product, warehouse, quantity, status, and expiry timestamp. Public UI statuses include `expired`, but the database keeps the PRD-required statuses: `PENDING`, `CONFIRMED`, and `RELEASED`.

## Concurrency Strategy

Reservation creation uses a single atomic Postgres update:

```sql
UPDATE "inventory_stocks"
SET "reserved_units" = "reserved_units" + $quantity
WHERE
  "product_id" = $productId
  AND "warehouse_id" = $warehouseId
  AND ("total_units" - "reserved_units") >= $quantity
RETURNING "id";
```

If two requests race for the last unit, Postgres serializes the row update. Exactly one update can satisfy the availability predicate; the loser returns `409 Conflict`.

Confirming a reservation decrements both `reservedUnits` and `totalUnits`. Releasing a reservation decrements only `reservedUnits`.

## Redis Idempotency Implementation

To ensure safe payment retries and reservation creations, both the reserve (`POST /api/reservations`) and confirm (`POST /api/reservations/:id/confirm`) endpoints are wrapped with a robust `withIdempotency` utility.

The implementation handles requests as follows when an `Idempotency-Key` header is provided:

1. **Cache Check**: The server generates a unique digest using the API route scope and the `Idempotency-Key`. It queries Redis (`getJson`) for a previously stored response. If found, it instantly returns the original response with an `x-idempotency-status: replayed` header, completely bypassing the database and preventing repeated side effects.
2. **Concurrent Lock**: If no cached response exists, the server attempts to acquire a short-lived Redis lock (`setLock`). This prevents race conditions where multiple identical requests are fired simultaneously before the first one finishes. If the lock is already held, the concurrent request polls and waits for the primary request to cache its result.
3. **Execution & Caching**: The core business logic is executed. The resulting success payload is saved to Redis with a 24-hour TTL. Future requests with the same key will now be served from this cache.
4. **Fallback**: If Redis environment variables are missing, the endpoints still function but return `x-idempotency-status: bypassed` to explicitly indicate that idempotency guarantees could not be applied. Production environments should always configure Redis.

## Expiry Strategy

Expiry is implemented with lazy cleanup plus a cron endpoint:

- Reads and writes call cleanup before calculating availability.
- `POST /api/cron/release-expired` can be scheduled from Vercel Cron.
- Expired pending reservations are marked `RELEASED`, and their reserved units are returned to availability.
- Confirming an expired reservation returns `410 Gone`.

Use the cron endpoint in production to reduce cleanup work on shopper traffic. Keep lazy cleanup as the correctness fallback.

## API

All responses use:

```json
{
  "data": {},
  "requestId": "..."
}
```

Errors use:

```json
{
  "error": {
    "code": "CONFLICT",
    "message": "..."
  },
  "requestId": "..."
}
```

Endpoints:

- `GET /api/products`: list products and stock by warehouse.
- `GET /api/warehouses`: list warehouses.
- `POST /api/reservations`: create a pending reservation.
- `GET /api/reservations/:id`: fetch reservation details for the checkout page.
- `POST /api/reservations/:id/confirm`: confirm a pending reservation.
- `POST /api/reservations/:id/release`: release a pending reservation.
- `POST /api/cron/release-expired`: release all expired pending reservations.

## Local Setup

Use Node 20 or newer.

```bash
npm ci
cp .env.example .env
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Set `DATABASE_URL` to a hosted Postgres database such as Supabase, Neon, or Railway. The exercise requires hosted Postgres rather than SQLite or a local-only database.

Environment variables:

- `DATABASE_URL`: Supabase transaction pooler URL for runtime app traffic. Use port `6543` with `pgbouncer=true` and a conservative `connection_limit`.
- `DIRECT_URL`: Supabase direct or session-pooler URL used by Prisma migrations. Use port `5432`.
- `RESERVATION_HOLD_MINUTES`: hold duration, defaults to `10`.
- `CRON_SECRET`: bearer token for the expiry cron endpoint.
- `REDIS_URL`: standard Redis connection string for idempotency.
- `UPSTASH_REDIS_REST_URL`: optional Upstash Redis REST URL for idempotency.
- `UPSTASH_REDIS_REST_TOKEN`: optional Upstash Redis REST token.

For Supabase + Prisma:

```env
DATABASE_URL="postgresql://prisma.PROJECT_REF:PRISMA_PASSWORD@REGION.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://prisma.PROJECT_REF:PRISMA_PASSWORD@REGION.pooler.supabase.com:5432/postgres"
UPSTASH_REDIS_REST_URL="https://YOUR-UPSTASH-INSTANCE.upstash.io"
UPSTASH_REDIS_REST_TOKEN="YOUR-UPSTASH-REST-TOKEN"
```

Use the transaction pooler for Vercel/serverless runtime traffic and `DIRECT_URL` for migration commands.

For a standard Redis provider, set `REDIS_URL` instead of the Upstash variables:

```env
REDIS_URL="redis://default:REDIS_PASSWORD@REDIS_HOST:REDIS_PORT"
```

## Deployment

Recommended deployment:

- Vercel for the Next.js app.
- Supabase or Neon for Postgres.
- Redis or Upstash Redis for idempotency.
- Vercel Cron calling `POST /api/cron/release-expired`.

Before first deploy:

```bash
npm run db:deploy
npm run db:seed
```

Configure Vercel Cron with:

```http
POST /api/cron/release-expired
Authorization: Bearer <CRON_SECRET>
```

## Validation

Run the full local validation suite:

```bash
npm run validate
```

Individual checks:

```bash
npm run typecheck
npm run lint
npm run test
npm run test:concurrency
npm audit --audit-level=moderate
npm run build
```

## Security And Operations

- Input validation is enforced with Zod.
- Duplicate reserve/confirm retries are guarded with Redis-backed idempotency.
- SQL injection is avoided by Prisma parameterized queries.
- Security headers are added in middleware.
- API responses avoid leaking internal errors.
- Structured logs include request IDs and business context.
- Basic in-memory throttling protects demo routes. For multi-instance production, move rate limiting to Redis or a managed edge rate limiter.
- Secrets are environment-based and never committed.
- CI runs typecheck, lint, tests, audit, and build.

## Trade-Offs

- Redis idempotency currently stores successful reserve and confirm responses. A later hardening pass can add request body fingerprinting and failed-response replay semantics.
- Unit tests currently cover domain policies and validation. An integration test script (`npm run test:concurrency`) is provided to verify the atomic Postgres update directly against the database.
- Lazy cleanup is retained for correctness, while cron is recommended to reduce request-path cleanup work.
- Authentication is intentionally omitted because the PRD lists it as out of scope for the shopper demo.
