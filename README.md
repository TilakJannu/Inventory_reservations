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

### Expiry Strategy & Production Mechanism

To prevent abandoned checkouts from locking inventory indefinitely, the system employs a robust **hybrid cleanup strategy** consisting of **Lazy Cleanup** (synchronous correctness) and **Active Cron Cleanup** (asynchronous optimization).

### 1. Lazy Cleanup (Synchronous Correctness)
Every database transaction on the reservation read/write paths first invokes a cleanup utility to release expired reservations:
- **Triggers**: Triggered synchronously during:
  - `POST /api/reservations` (before checking stock and reserving)
  - `GET /api/reservations/:id` (before rendering the checkout page)
  - `POST /api/reservations/:id/confirm` (before validating and finalizing payment)
  - `POST /api/reservations/:id/release` (before releasing the reservation)
- **Correctness Guarantee**: This ensures that a customer can never be blocked by a "phantom hold" that should have already expired. If a shopper attempts to confirm a reservation that has expired but not yet been cleaned up by the cron job, the lazy cleanup runs first inside the transaction, releases the stock, and causes the confirm action to return a `410 Gone` error.

### 2. Active Cron Cleanup (Asynchronous Optimization)
For production, relying solely on lazy cleanup means that the first shopper request after a period of inactivity may bear the latency penalty of cleaning up multiple expired records. 
- **Endpoint**: `POST /api/cron/release-expired`
- **Mechanism**: Can be scheduled via Vercel Cron (or any external scheduler) to run at regular intervals (e.g., every minute).
- **Execution**: The endpoint performs a bulk release of all expired pending reservations in the background.

### 3. Expiry State Transitions
Within the database transaction block:
1. The system identifies all reservations with status `PENDING` where `expiresAt <= now`.
2. For each expired reservation, it executes an atomic PostgreSQL update:
   ```sql
   UPDATE "inventory_stocks"
   SET "reserved_units" = "reserved_units" - :quantity
   WHERE "product_id" = :productId AND "warehouse_id" = :warehouseId AND "reserved_units" >= :quantity;
   ```
3. The reservation record's status is transitioned to `RELEASED` and the `releasedAt` field is set to `now`.
4. This instantly returns the units back to the pool of available stock.

---

## Local Setup

### System Requirements
- Node.js 20 or newer
- PostgreSQL database (either a local instance or a hosted database like Supabase/Neon)

### Step-by-Step Instructions

1. **Clone & Install Dependencies**:
   ```bash
   git clone <repo-url>
   cd allo-inventory-reservations
   npm ci
   ```

2. **Configure Environment Variables**:
   Create a `.env` file by copying the template:
   ```bash
   cp .env.example .env
   ```
   Open `.env` and fill out the configuration:
   - `DATABASE_URL`: Connection string for your PostgreSQL database (e.g., `postgresql://postgres:postgres@localhost:5432/allo_inventory`).
   - `DIRECT_URL`: Direct connection string used for schema migrations (can be the same as `DATABASE_URL` if not using a connection pooler).
   - `RESERVATION_HOLD_MINUTES`: Hold duration in minutes (defaults to `10` if not set).
   - `CRON_SECRET`: Random secret string to authorize the cron endpoint.
   - `REDIS_URL` / `UPSTASH_REDIS_REST_URL`: (Optional) Connection strings to configure Redis for idempotency. If omitted, idempotency checks are bypassed safely.

3. **Running PostgreSQL Locally (Optional via Docker)**:
   If you do not have a running database, you can start a local PostgreSQL container using Docker:
   ```bash
   docker run --name allo-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=allo_inventory -p 5432:5432 -d postgres
   ```
   Your `.env` database URLs will then be:
   ```env
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/allo_inventory"
   DIRECT_URL="postgresql://postgres:postgres@localhost:5432/allo_inventory"
   ```

4. **Initialize Database & Seed Data**:
   Generate the Prisma client, run migrations to set up schema tables, and seed the database with initial products, warehouses, and inventory:
   ```bash
   npm run db:generate
   npm run db:migrate
   npm run db:seed
   ```
   *Note: The seed script (`prisma/seed.ts`) populates the database with default warehouses (e.g., Delhi, Bangalore, Mumbai), products, and initial stock quantities.*

5. **Start the Development Server**:
   ```bash
   npm run dev
   ```
   The app will run locally at `http://localhost:3000`.

---

## Deployment

Recommended production deployment stack:
- **Vercel** for the Next.js frontend and serverless API route handlers.
- **Supabase or Neon** for managed PostgreSQL.
- **Upstash Redis** for serverless Redis-backed idempotency.
- **Vercel Cron** to schedule the expiry cleanup.

Before the first deployment, run migrations and seed data in production:
```bash
npm run db:deploy
npm run db:seed
```

Configure your cron scheduler to trigger the cleanup endpoint:
```http
POST https://your-production-app.vercel.app/api/cron/release-expired
Authorization: Bearer <YOUR_CRON_SECRET>
```

---

## Validation

Run the full local validation suite (type checking, linting, unit tests, concurrency tests, security audit, and production build):
```bash
npm run validate
```

Individual command checks:
- **Type Check**: `npm run typecheck`
- **Lint**: `npm run lint`
- **Unit Tests**: `npm run test`
- **Concurrency Integration Tests**: `npm run test:concurrency` (simulates concurrent checkout races against the database)
- **Security Audit**: `npm audit --audit-level=moderate`
- **Build**: `npm run build`

---

## Security & Operations

- **Input Validation**: Enforced at the boundary using Zod schemas.
- **Idempotency Protection**: Duplicate requests with matching `Idempotency-Key` headers are cached in Redis to prevent multiple reservations or double confirmation side effects.
- **SQL Injection Prevention**: Prisma ORM and parameterized raw SQL queries (`$queryRaw`) ensure queries are secure.
- **Security Headers**: Standard security headers configured via Next.js middleware.
- **Error Obfuscation**: Custom error middleware sanitizes internal exceptions to avoid leaking details in API responses while logging full tracebacks internally.
- **Rate Limiting**: Includes basic in-memory throttling on API endpoints.

---

## Trade-Offs & Future Improvements

### 1. Materialized `reserved_units` vs. On-The-Fly Aggregation
- **Trade-Off**: We chose to keep a materialized `reserved_units` count directly on the `InventoryStock` table, updating it atomically. The alternative would be to derive availability dynamically by running a `SUM` query over all active pending reservations on every page load. Materializing the count makes the listing page load extremely fast, but introduces the risk of cache drift if a reservation is created or released without updating the parent row. 
- **Mitigation**: We wrap all stock changes in database transactions to guarantee atomic synchronization.

### 2. Atomic Database Update vs. Distributed Locks
- **Trade-Off**: We use a raw SQL conditional update (`UPDATE ... WHERE (total_units - reserved_units) >= quantity`) to reserve stock atomically. This guarantees correctness under high concurrency without the overhead of maintaining a distributed lock manager (like Redlock on Redis). However, it couples the application to PostgreSQL-specific raw SQL syntax, making database-agnostic switching (e.g., to MySQL or SQLite) harder.

### 3. Fail-Open Idempotency
- **Trade-Off**: If Redis is down or unconfigured, the idempotency middleware logs the error and proceeds with the operation (`x-idempotency-status: bypassed`). This favors system availability over absolute consistency. For a production system handling high-value payments, we would switch to a **fail-closed** model where any idempotency caching failure results in a `500 Internal Server Error`, guaranteeing that duplicate payment confirmations can never occur.

### 4. Next.js Route Handlers vs. Server Actions
- **Trade-Off**: We chose standard API Route Handlers over Next.js Server Actions. While Server Actions simplify React data bindings, Route Handlers allow us to fully control HTTP headers (such as reading the `Idempotency-Key` header, appending `x-idempotency-status` responses, and verifying Bearer authentication tokens for the Cron endpoint).

### 5. Lazy Cleanup latency under High Traffic
- **Trade-Off**: Lazy cleanup ensures consistency but can add database load to user request paths. With more time, we would replace lazy cleanup entirely with a delayed job queue (e.g., BullMQ powered by Redis) where creating a reservation publishes a job to release the inventory precisely 10 minutes later, entirely decoupling cleanup latency from user threads.
