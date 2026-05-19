import type { ReservationStatus } from "@prisma/client";

export type PublicReservationStatus = "pending" | "confirmed" | "released" | "expired";

export function isReservationExpired(status: ReservationStatus, expiresAt: Date, now: Date): boolean {
  return status === "PENDING" && expiresAt <= now;
}

export function toPublicReservationStatus(
  status: ReservationStatus,
  expiresAt: Date,
  now: Date
): PublicReservationStatus {
  if (isReservationExpired(status, expiresAt, now)) {
    return "expired";
  }

  switch (status) {
    case "PENDING":
      return "pending";
    case "CONFIRMED":
      return "confirmed";
    case "RELEASED":
      return "released";
  }
}
