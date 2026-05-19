import { requestJson } from "@/features/shared/api-client";
import type { Reservation } from "./types";

export function fetchReservation(id: string): Promise<Reservation> {
  return requestJson<Reservation>(`/api/reservations/${id}`, {
    method: "GET",
    cache: "no-store"
  });
}

export function confirmReservation(id: string): Promise<Reservation> {
  return requestJson<Reservation>(`/api/reservations/${id}/confirm`, {
    method: "POST",
    headers: {
      "Idempotency-Key": crypto.randomUUID()
    }
  });
}

export function releaseReservation(id: string): Promise<Reservation> {
  return requestJson<Reservation>(`/api/reservations/${id}/release`, {
    method: "POST"
  });
}
