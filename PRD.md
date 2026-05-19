# Product Requirements Document: Inventory Reservation Checkout

## 1. Overview

Allo needs a checkout-time inventory reservation system for multi-warehouse retail and D2C brands. The system should temporarily hold stock when a shopper starts checkout, then either confirm the hold after successful payment or release it after failure, cancellation, or expiry.

The product exists to prevent overselling physical units without making inventory appear unavailable too early in the shopping journey.

## 2. Problem Statement

Retail checkout creates a race condition:

- If inventory is decremented only after payment succeeds, two shoppers can pay for the same final unit.
- If inventory is decremented when items are added to cart, abandoned carts make sellable inventory look unavailable.
- Payment flows can take several minutes, during which stock availability must remain accurate under concurrent demand.

The system must reserve units for a short checkout window and guarantee that concurrent requests cannot reserve more stock than exists.

## 3. Goals

- Allow shoppers to reserve available stock from a specific warehouse during checkout.
- Prevent overselling under concurrent reservation requests.
- Show accurate available stock by product and warehouse.
- Let shoppers confirm or cancel a reservation from the UI.
- Automatically release expired pending reservations so inventory becomes available again.
- Surface reservation failures clearly to users, especially insufficient stock and expired reservations.
- Provide a deployable, seeded demo suitable for an end-to-end debrief.

## 4. Non-Goals

- Full cart management before checkout.
- Payment provider integration.
- Authentication, account management, or customer profiles.
- Shipping-rate calculation or warehouse allocation optimization.
- Admin inventory management UI.
- Returns, refunds, backorders, substitutions, or partial fulfillment.
- Multi-item reservations in the initial version.

## 5. Users

### Shopper

Wants to reserve an item during checkout, complete or cancel the purchase, and understand when the reservation is no longer valid.

### Operations / Fulfillment Team

Needs confidence that confirmed orders correspond to actual stock and that expired or failed checkouts do not keep inventory locked.

### Engineering Reviewer

Needs to verify that the implementation is correct under concurrency, understandable, and deployable with a hosted data layer.

## 6. Product Scope

### In Scope for Initial Release

- Product listing with available stock grouped by warehouse.
- Warehouse listing API.
- Reservation creation for a product, warehouse, and quantity.
- Reservation confirmation when payment succeeds.
- Reservation release when payment fails or the user cancels.
- Reservation expiry after a short hold window, defaulting to 10 minutes.
- Available stock calculation as `totalUnits - reservedUnits`.
- Reservation statuses: `pending`, `confirmed`, and `released`.
- User-visible errors for:
  - `409 Conflict`: insufficient available stock.
  - `410 Gone`: reservation expired.
- Seed data for demo products, warehouses, and inventory levels.
- README documentation covering local setup, environment variables, migrations, seed data, expiry approach, trade-offs, and future improvements.

### Optional Scope

- Idempotency for reservation and confirmation endpoints using the `Idempotency-Key` header.
- Redis-backed locking or idempotency storage if needed by the selected architecture.
- Basic automated tests for concurrency-critical reservation behavior.

### Out of Scope for Initial Release

- Multi-SKU checkout reservations.
- Cross-warehouse split reservations.
- Advanced stock allocation rules.
- Real payment authorization or capture.
- Inventory import/export tools.
- Role-based dashboards.

## 7. Core User Flows

### Browse Available Stock

1. Shopper opens the product listing page.
2. The app displays products and available units per warehouse.
3. Shopper chooses a product and warehouse with available stock.
4. Shopper clicks `Reserve`.

### Reserve Stock

1. Frontend sends `POST /api/reservations` with product, warehouse, and quantity.
2. API validates the request.
3. API checks available stock and creates a pending reservation atomically.
4. If stock is available, shopper is sent to the reservation page.
5. If stock is unavailable, shopper sees a clear insufficient-stock error.

### Confirm Reservation

1. Shopper reviews reservation details and countdown.
2. Shopper clicks `Confirm purchase`.
3. API confirms the pending reservation if it has not expired.
4. UI updates to confirmed state and listing stock reflects the permanent decrement.
5. If expired, shopper sees a clear expired-reservation error.

### Cancel Reservation

1. Shopper clicks `Cancel`.
2. API releases the pending reservation.
3. UI updates to released state.
4. Product listing shows the units as available again.

### Expire Reservation

1. Pending reservation reaches `expiresAt`.
2. System releases the reservation automatically or lazily during reads/writes.
3. Available stock includes the released units again.
4. Attempts to confirm the expired reservation return `410 Gone`.

## 8. Functional Requirements

### Products

- The system must store products with stable identifiers and display names.
- The product listing must show available stock per warehouse.
- The product listing must update after reservation confirmation or release without a manual browser refresh.

### Warehouses

- The system must store warehouses with stable identifiers and display names.
- The API must expose the list of warehouses.

### Inventory

- The system must store stock per product and warehouse.
- Each inventory record must include total units.
- Reserved units must be derivable from pending reservations or maintained in a transactionally safe way.
- Available stock must never be negative.

### Reservations

- The system must create reservations with:
  - product ID
  - warehouse ID
  - quantity
  - status
  - expiry timestamp
  - created timestamp
  - updated timestamp
- Newly created reservations must start as `pending`.
- Confirmed reservations must permanently consume stock.
- Released reservations must make their units available again.
- Expired pending reservations must not be confirmable.

### Error Handling

- `POST /api/reservations` must return `409 Conflict` when requested quantity exceeds available stock.
- `POST /api/reservations/:id/confirm` must return `410 Gone` when the reservation has expired.
- Frontend must display API errors in the relevant user flow.

## 9. API Requirements

### `GET /api/products`

Lists products with available stock per warehouse.

Response should include:

- product ID
- product name
- warehouse stock breakdown
- total units
- reserved units or available units

### `GET /api/warehouses`

Lists warehouses.

Response should include:

- warehouse ID
- warehouse name

### `POST /api/reservations`

Creates a pending reservation.

Request should include:

- product ID
- warehouse ID
- quantity

Behavior:

- Validate input.
- Release or ignore expired reservations before calculating availability.
- Atomically ensure enough stock exists.
- Return the created reservation.
- Return `409 Conflict` if there is insufficient stock.

### `POST /api/reservations/:id/confirm`

Confirms a pending reservation.

Behavior:

- Return the confirmed reservation if pending and unexpired.
- Return `410 Gone` if expired.
- Treat already confirmed reservations according to the idempotency design if implemented.

### `POST /api/reservations/:id/release`

Releases a pending reservation.

Behavior:

- Return the released reservation.
- Releasing an already released reservation should be harmless.
- Confirmed reservations should not be releasable.

## 10. Concurrency Requirements

The reservation creation path is the critical correctness surface.

When two requests attempt to reserve the last available unit of the same product and warehouse at the same time:

- Exactly one request must create a pending reservation.
- The other request must receive `409 Conflict`.
- Available stock must remain accurate after both requests complete.

Acceptable implementation approaches include:

- Database transaction with row-level lock on the relevant inventory row.
- Atomic conditional update that increments reserved stock only when available stock is sufficient.
- Serializable transaction isolation with retry handling.
- Distributed lock plus database transaction, if using multiple app instances.

The chosen approach must be documented in the README.

## 11. Expiry Requirements

Pending reservations should expire after 10 minutes unless otherwise configured.

The implementation may use one of the following:

- Lazy cleanup on read/write paths.
- Scheduled cleanup through Vercel Cron.
- Background worker.

Regardless of mechanism:

- Expired reservations must not block available stock.
- Expired reservations must not be confirmable.
- The README must describe the production expiry strategy and trade-offs.

## 12. Frontend Requirements

### Product Listing Page

- Show all seeded products.
- Show available stock by warehouse.
- Provide a clear reserve action for available stock.
- Disable or handle reserve attempts when stock is unavailable.
- Reflect stock changes after confirmation, cancellation, or expiry.

### Reservation Page

- Show product, warehouse, quantity, reservation status, and expiry time.
- Show a live countdown to expiry for pending reservations.
- Provide `Confirm purchase` and `Cancel` actions while pending.
- Show confirmed, released, and expired states clearly.
- Display `409` and `410` errors when they occur.

## 13. Data Model Scope

Minimum entities:

- `Product`
- `Warehouse`
- `InventoryStock`
- `Reservation`

Recommended relationships:

- A product has many inventory stock records.
- A warehouse has many inventory stock records.
- A reservation belongs to one product and one warehouse.
- A reservation references the stock location being held.

Recommended reservation statuses:

- `pending`
- `confirmed`
- `released`

## 14. Success Criteria

- A reviewer can open the deployed app and complete reserve, confirm, cancel, and expiry flows.
- The product listing reflects stock changes without a manual refresh.
- Concurrent attempts to reserve the final unit produce one success and one `409`.
- Expired reservations return `410` on confirmation.
- README explains setup, deployment assumptions, expiry mechanism, concurrency strategy, and trade-offs.
- Code is structured enough for another engineer to extend.

## 15. Milestones

### Milestone 1: Foundation

- Create Next.js App Router project with TypeScript.
- Add database schema for products, warehouses, inventory, and reservations.
- Add seed data.

### Milestone 2: Reservation API

- Implement product and warehouse listing endpoints.
- Implement reservation create, confirm, and release endpoints.
- Add concurrency-safe stock reservation logic.

### Milestone 3: Frontend Flow

- Build product listing page.
- Build reservation detail page with countdown.
- Add user-visible error handling.

### Milestone 4: Expiry and Validation

- Implement expiry cleanup strategy.
- Add validation with clear response codes.
- Add focused tests or scripts for concurrency behavior.

### Milestone 5: Delivery

- Write README.
- Deploy app with hosted Postgres.
- Seed production data.
- Confirm live demo flow works end to end.

## 16. Open Decisions

- Hosted database provider: Supabase, Neon, Railway, or equivalent.
- Whether to maintain `reservedUnits` on inventory rows or derive it from pending reservations.
- Expiry strategy: lazy cleanup, cron, or worker.
- Whether to implement idempotency as part of the first pass.
- Whether Redis is needed for locking/idempotency or if Postgres transactions are sufficient.

