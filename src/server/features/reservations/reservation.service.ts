import { Prisma, ReservationStatus } from "@prisma/client";
import { getConfig } from "@/server/config/env";
import { prisma } from "@/server/db/prisma";
import { ConflictError, GoneError, NotFoundError } from "@/server/http/errors";
import { logger } from "@/server/observability/logger";
import type { CreateReservationInput } from "./reservation.schemas";
import { toReservationResponse, type ReservationResponse } from "./reservation.dto";

type TransactionClient = Prisma.TransactionClient;

type InventoryUpdateRow = {
  id: string;
  total_units: number;
  reserved_units: number;
};

type ReservationLookup = Prisma.ReservationGetPayload<{
  include: {
    product: true;
    warehouse: true;
  };
}>;

export async function createReservation(
  input: CreateReservationInput,
  requestId: string
): Promise<ReservationResponse> {
  const config = getConfig();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.RESERVATION_HOLD_MINUTES * 60_000);

  const reservation = await prisma.$transaction(async (tx) => {
    await releaseExpiredReservations(tx, now);

    const updatedRows = await reserveInventoryAtomically(tx, input, now);

    if (updatedRows.length !== 1) {
      throw new ConflictError("Not enough stock is available for this product and warehouse.");
    }

    logger.info("Inventory reserved", {
      requestId,
      productId: input.productId,
      warehouseId: input.warehouseId,
      quantity: input.quantity
    });

    return tx.reservation.create({
      data: {
        productId: input.productId,
        warehouseId: input.warehouseId,
        quantity: input.quantity,
        expiresAt
      },
      include: {
        product: true,
        warehouse: true
      }
    });
  });

  return toReservationResponse(reservation, now);
}

export async function getReservation(id: string): Promise<ReservationResponse> {
  const now = new Date();
  const reservation = await prisma.$transaction(async (tx) => {
    await releaseExpiredReservations(tx, now);
    return findReservationOrThrow(tx, id);
  });

  return toReservationResponse(reservation, now);
}

export async function confirmReservation(id: string, requestId: string): Promise<ReservationResponse> {
  const now = new Date();

  const reservation = await prisma.$transaction(async (tx) => {
    await releaseExpiredReservations(tx, now, id);
    const current = await findReservationOrThrow(tx, id);

    if (current.status === ReservationStatus.CONFIRMED) {
      return current;
    }

    if (current.status === ReservationStatus.RELEASED) {
      if (current.expiresAt <= now) {
        throw new GoneError("This reservation has expired.");
      }

      throw new ConflictError("This reservation has already been released.");
    }

    if (current.expiresAt <= now) {
      await releasePendingReservation(tx, current, now);
      throw new GoneError("This reservation has expired.");
    }

    const updatedRows = await tx.$queryRaw<InventoryUpdateRow[]>`
      UPDATE "inventory_stocks"
      SET
        "reserved_units" = "reserved_units" - ${current.quantity},
        "total_units" = "total_units" - ${current.quantity},
        "updated_at" = ${now}
      WHERE
        "product_id" = ${current.productId}
        AND "warehouse_id" = ${current.warehouseId}
        AND "reserved_units" >= ${current.quantity}
        AND "total_units" >= ${current.quantity}
      RETURNING "id", "total_units", "reserved_units";
    `;

    if (updatedRows.length !== 1) {
      throw new ConflictError("Reservation inventory is no longer available to confirm.");
    }

    logger.info("Reservation confirmed", {
      requestId,
      reservationId: id,
      productId: current.productId,
      warehouseId: current.warehouseId
    });

    return tx.reservation.update({
      where: { id },
      data: {
        status: ReservationStatus.CONFIRMED,
        confirmedAt: now
      },
      include: {
        product: true,
        warehouse: true
      }
    });
  });

  return toReservationResponse(reservation, now);
}

export async function releaseReservation(id: string, requestId: string): Promise<ReservationResponse> {
  const now = new Date();

  const reservation = await prisma.$transaction(async (tx) => {
    await releaseExpiredReservations(tx, now, id);
    const current = await findReservationOrThrow(tx, id);

    if (current.status === ReservationStatus.CONFIRMED) {
      throw new ConflictError("Confirmed reservations cannot be released.");
    }

    if (current.status === ReservationStatus.RELEASED) {
      return current;
    }

    logger.info("Reservation released", {
      requestId,
      reservationId: id,
      productId: current.productId,
      warehouseId: current.warehouseId
    });

    return releasePendingReservation(tx, current, now);
  });

  return toReservationResponse(reservation, now);
}

export async function releaseAllExpiredReservations(): Promise<number> {
  return prisma.$transaction(async (tx) => releaseExpiredReservations(tx, new Date()));
}

async function reserveInventoryAtomically(
  tx: TransactionClient,
  input: CreateReservationInput,
  now: Date
): Promise<InventoryUpdateRow[]> {
  return tx.$queryRaw<InventoryUpdateRow[]>`
    UPDATE "inventory_stocks"
    SET
      "reserved_units" = "reserved_units" + ${input.quantity},
      "updated_at" = ${now}
    WHERE
      "product_id" = ${input.productId}
      AND "warehouse_id" = ${input.warehouseId}
      AND ("total_units" - "reserved_units") >= ${input.quantity}
    RETURNING "id", "total_units", "reserved_units";
  `;
}

async function findReservationOrThrow(tx: TransactionClient, id: string): Promise<ReservationLookup> {
  const reservation = await tx.reservation.findUnique({
    where: { id },
    include: {
      product: true,
      warehouse: true
    }
  });

  if (!reservation) {
    throw new NotFoundError("Reservation not found.");
  }

  return reservation;
}

async function releasePendingReservation(
  tx: TransactionClient,
  reservation: ReservationLookup,
  now: Date
): Promise<ReservationLookup> {
  const updatedRows = await tx.$queryRaw<InventoryUpdateRow[]>`
    UPDATE "inventory_stocks"
    SET
      "reserved_units" = "reserved_units" - ${reservation.quantity},
      "updated_at" = ${now}
    WHERE
      "product_id" = ${reservation.productId}
      AND "warehouse_id" = ${reservation.warehouseId}
      AND "reserved_units" >= ${reservation.quantity}
    RETURNING "id", "total_units", "reserved_units";
  `;

  if (updatedRows.length !== 1) {
    throw new ConflictError("Reservation inventory could not be released safely.");
  }

  return tx.reservation.update({
    where: { id: reservation.id },
    data: {
      status: ReservationStatus.RELEASED,
      releasedAt: now
    },
    include: {
      product: true,
      warehouse: true
    }
  });
}

async function releaseExpiredReservations(
  tx: TransactionClient,
  now: Date,
  excludeReservationId?: string
): Promise<number> {
  const expiredReservations = await tx.reservation.findMany({
    where: {
      status: ReservationStatus.PENDING,
      expiresAt: {
        lte: now
      },
      id: excludeReservationId
        ? {
            not: excludeReservationId
          }
        : undefined
    },
    include: {
      product: true,
      warehouse: true
    }
  });

  for (const reservation of expiredReservations) {
    await releasePendingReservation(tx, reservation, now);
  }

  return expiredReservations.length;
}
