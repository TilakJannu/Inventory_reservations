import { describe, expect, it } from "vitest";
import { createReservationSchema, reservationIdSchema } from "./reservation.schemas";

describe("reservation schemas", () => {
  it("accepts a valid reservation request", () => {
    const parsed = createReservationSchema.parse({
      productId: "cm7s6x8w9000008l4h8f5b8gw",
      warehouseId: "cm7s6x8w9000108l4f4x0a7ks",
      quantity: 1
    });

    expect(parsed.quantity).toBe(1);
  });

  it("rejects invalid quantities", () => {
    expect(() =>
      createReservationSchema.parse({
        productId: "cm7s6x8w9000008l4h8f5b8gw",
        warehouseId: "cm7s6x8w9000108l4f4x0a7ks",
        quantity: 0
      })
    ).toThrow();
  });

  it("validates reservation route params", () => {
    expect(reservationIdSchema.parse({ id: "cm7s6x8w9000208l4cbz6df7s" }).id).toContain("cm7");
  });
});
