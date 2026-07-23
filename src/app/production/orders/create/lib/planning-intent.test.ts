import { describe, it, expect } from "vitest";
import {
  resolvePlannedQuantity,
  describePlanningIntent,
  type PlanningIntent,
} from "./planning-intent";

describe("resolvePlannedQuantity", () => {
  it("returns baseQty for base mode", () => {
    const intent: PlanningIntent = { mode: "base", baseQty: 600 };
    expect(resolvePlannedQuantity(intent)).toBe(600);
  });

  it("converts sales unit to base", () => {
    const intent: PlanningIntent = {
      mode: "sales",
      enteredQty: 24,
      salesUnit: "BAL",
      factor: 25,
    };
    expect(resolvePlannedQuantity(intent)).toBe(600);
  });

  it("multiplies batch count by BOM output", () => {
    const intent: PlanningIntent = {
      mode: "batch",
      batchCount: 2,
      bomOutputQty: 300,
    };
    expect(resolvePlannedQuantity(intent)).toBe(600);
  });

  it("returns 0 for zero batch count", () => {
    const intent: PlanningIntent = {
      mode: "batch",
      batchCount: 0,
      bomOutputQty: 300,
    };
    expect(resolvePlannedQuantity(intent)).toBe(0);
  });
});

describe("describePlanningIntent", () => {
  it("describes base mode", () => {
    expect(describePlanningIntent({ mode: "base", baseQty: 600 })).toBe(
      "600 (dasar)",
    );
  });

  it("describes sales mode with calculation", () => {
    expect(
      describePlanningIntent({
        mode: "sales",
        enteredQty: 24,
        salesUnit: "BAL",
        factor: 25,
      }),
    ).toBe("24 BAL × 25 = 600");
  });

  it("describes batch mode with calculation", () => {
    expect(
      describePlanningIntent({
        mode: "batch",
        batchCount: 2,
        bomOutputQty: 300,
      }),
    ).toBe("2 batch × 300 = 600");
  });
});
