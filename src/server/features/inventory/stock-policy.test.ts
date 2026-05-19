import { describe, expect, it } from "vitest";
import { ConflictError } from "@/server/http/errors";
import { assertCanReserve, calculateAvailableUnits } from "./stock-policy";

describe("stock policy", () => {
  it("calculates available units from total and reserved units", () => {
    expect(calculateAvailableUnits(10, 3)).toBe(7);
  });

  it("never exposes negative availability", () => {
    expect(calculateAvailableUnits(2, 5)).toBe(0);
  });

  it("allows reservations within available stock", () => {
    expect(() => assertCanReserve(4, 2, 2)).not.toThrow();
  });

  it("rejects reservations that exceed available stock", () => {
    expect(() => assertCanReserve(4, 3, 2)).toThrow(ConflictError);
  });
});
