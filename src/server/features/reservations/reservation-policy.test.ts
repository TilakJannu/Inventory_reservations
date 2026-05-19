import { describe, expect, it } from "vitest";
import { isReservationExpired, toPublicReservationStatus } from "./reservation-policy";

describe("reservation policy", () => {
  const now = new Date("2026-05-17T18:00:00.000Z");

  it("treats pending reservations at or past expiry as expired", () => {
    expect(isReservationExpired("PENDING", now, now)).toBe(true);
  });

  it("does not treat confirmed reservations as expired", () => {
    expect(isReservationExpired("CONFIRMED", new Date("2026-05-17T17:59:00.000Z"), now)).toBe(false);
  });

  it("maps private database statuses to public UI statuses", () => {
    expect(toPublicReservationStatus("PENDING", new Date("2026-05-17T18:01:00.000Z"), now)).toBe(
      "pending"
    );
    expect(toPublicReservationStatus("CONFIRMED", now, now)).toBe("confirmed");
    expect(toPublicReservationStatus("RELEASED", now, now)).toBe("released");
    expect(toPublicReservationStatus("PENDING", new Date("2026-05-17T17:59:00.000Z"), now)).toBe(
      "expired"
    );
  });
});
