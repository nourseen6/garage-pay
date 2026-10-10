import { describe, expect, it } from "vitest";
import {
  canMoveTo,
  calculateBalance,
  createTentativeInvoice,
  needsOverageApproval,
} from "./workflow";

describe("GaragePay workflow rules", () => {
  it("requires a deposit before a car can be received", () => {
    expect(canMoveTo("deposit_pending", "car_received")).toBe(false);
    expect(canMoveTo("deposit_paid", "car_received")).toBe(true);
  });

  it("allows exactly one client counter offer", () => {
    expect(canMoveTo("quoted", "counter_pending")).toBe(true);
    expect(canMoveTo("counter_pending", "counter_pending")).toBe(false);
  });

  it("creates a 40 percent tentative deposit in piasters", () => {
    expect(createTentativeInvoice(125_000)).toEqual({
      tentativeTotalPiasters: 125_000,
      depositDuePiasters: 50_000,
    });
  });

  it("requires approval when final total is over 15 percent higher", () => {
    expect(needsOverageApproval(100_000, 115_000)).toBe(false);
    expect(needsOverageApproval(100_000, 115_001)).toBe(true);
  });

  it("calculates the balance from the final invoice and paid deposit", () => {
    expect(calculateBalance(162_000, 50_000)).toBe(112_000);
  });
});
