import { ConflictError } from "@/server/http/errors";

export function calculateAvailableUnits(totalUnits: number, reservedUnits: number): number {
  return Math.max(totalUnits - reservedUnits, 0);
}

export function assertCanReserve(totalUnits: number, reservedUnits: number, quantity: number): void {
  if (quantity <= 0) {
    throw new ConflictError("Reservation quantity must be greater than zero.");
  }

  if (calculateAvailableUnits(totalUnits, reservedUnits) < quantity) {
    throw new ConflictError("Not enough stock is available for this product and warehouse.");
  }
}
