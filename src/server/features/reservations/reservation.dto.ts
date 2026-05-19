import type { Product, Reservation, Warehouse } from "@prisma/client";
import { toPublicReservationStatus, type PublicReservationStatus } from "./reservation-policy";

type ReservationWithRelations = Reservation & {
  product: Product;
  warehouse: Warehouse;
};

export type ReservationResponse = {
  id: string;
  product: {
    id: string;
    name: string;
    description: string;
  };
  warehouse: {
    id: string;
    name: string;
    city: string;
  };
  quantity: number;
  status: PublicReservationStatus;
  expiresAt: string;
  confirmedAt: string | null;
  releasedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export function toReservationResponse(
  reservation: ReservationWithRelations,
  now = new Date()
): ReservationResponse {
  return {
    id: reservation.id,
    product: {
      id: reservation.product.id,
      name: reservation.product.name,
      description: reservation.product.description
    },
    warehouse: {
      id: reservation.warehouse.id,
      name: reservation.warehouse.name,
      city: reservation.warehouse.city
    },
    quantity: reservation.quantity,
    status: toPublicReservationStatus(reservation.status, reservation.expiresAt, now),
    expiresAt: reservation.expiresAt.toISOString(),
    confirmedAt: reservation.confirmedAt?.toISOString() ?? null,
    releasedAt: reservation.releasedAt?.toISOString() ?? null,
    createdAt: reservation.createdAt.toISOString(),
    updatedAt: reservation.updatedAt.toISOString()
  };
}
