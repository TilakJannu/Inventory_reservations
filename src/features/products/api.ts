import { requestJson } from "@/features/shared/api-client";
import type { ProductStock } from "./types";

export function fetchProducts(): Promise<ProductStock[]> {
  return requestJson<ProductStock[]>("/api/products", {
    method: "GET",
    cache: "no-store"
  });
}

export function createReservation(productId: string, warehouseId: string): Promise<{ id: string }> {
  return requestJson<{ id: string }>("/api/reservations", {
    method: "POST",
    headers: {
      "Idempotency-Key": crypto.randomUUID()
    },
    body: JSON.stringify({
      productId,
      warehouseId,
      quantity: 1
    })
  });
}
