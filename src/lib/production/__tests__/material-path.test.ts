import { describe, expect, it } from "vitest";
import {
  isFloorWipCategory,
  isWarehouseRmCategory,
  resolveMaterialPath,
} from "@/lib/production/material-path";

describe("resolveMaterialPath", () => {
  it("maps MIXING to warehouse_rm (Path A)", () => {
    expect(resolveMaterialPath("MIXING")).toBe("warehouse_rm");
    expect(isWarehouseRmCategory("MIXING")).toBe(true);
  });

  it("maps EXTRUSION/PACKING/REWORK to floor_wip (Path B)", () => {
    expect(resolveMaterialPath("EXTRUSION")).toBe("floor_wip");
    expect(resolveMaterialPath("PACKING")).toBe("floor_wip");
    expect(resolveMaterialPath("REWORK")).toBe("floor_wip");
    expect(isFloorWipCategory("EXTRUSION")).toBe(true);
  });

  it("defaults STANDARD/unknown to warehouse_rm", () => {
    expect(resolveMaterialPath("STANDARD")).toBe("warehouse_rm");
    expect(resolveMaterialPath(null)).toBe("warehouse_rm");
    expect(resolveMaterialPath(undefined)).toBe("warehouse_rm");
  });
});
