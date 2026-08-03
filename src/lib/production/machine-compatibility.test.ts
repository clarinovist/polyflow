import { describe, it, expect } from "vitest";
import {
  getCompatibleMachineTypes,
  isMachineCompatibleWithCategory,
  filterMachinesByStage,
  PROCESS_MACHINE_FALLBACK,
  resolveMachineStageMap,
  parseMachineStageMap,
  DEFAULT_CATEGORY_MACHINE_MAP,
} from "./machine-compatibility";

describe("getCompatibleMachineTypes", () => {
  it("returns MIXER for MIXING", () => {
    expect(getCompatibleMachineTypes("MIXING")).toEqual(["MIXER"]);
  });

  it("returns EXTRUDER+REWINDER for EXTRUSION", () => {
    expect(getCompatibleMachineTypes("EXTRUSION")).toEqual(["EXTRUDER", "REWINDER"]);
  });

  it("returns all for REWORK", () => {
    expect(getCompatibleMachineTypes("REWORK")).toHaveLength(5);
  });

  it("returns EXTRUDER+MIXER for STANDARD", () => {
    expect(getCompatibleMachineTypes("STANDARD")).toEqual(["EXTRUDER", "MIXER"]);
  });

  it("returns empty for unknown", () => {
    expect(getCompatibleMachineTypes("UNKNOWN")).toEqual([]);
  });

  it("honors override map for PACKING", () => {
    const override = { PACKING: ["PACKER", "GRANULATOR", "REWINDER"] };
    expect(getCompatibleMachineTypes("PACKING", override)).toEqual([
      "PACKER",
      "GRANULATOR",
      "REWINDER",
    ]);
  });

  it("falls back to default for keys absent in override", () => {
    const override = { PACKING: ["PACKER"] };
    expect(getCompatibleMachineTypes("MIXING", override)).toEqual(["MIXER"]);
  });
});

describe("isMachineCompatibleWithCategory", () => {
  it("accepts MIXER for MIXING", () => {
    expect(isMachineCompatibleWithCategory("MIXER", "MIXING")).toBe(true);
  });

  it("rejects PACKER for MIXING", () => {
    expect(isMachineCompatibleWithCategory("PACKER", "MIXING")).toBe(false);
  });

  it("accepts EXTRUDER for STANDARD", () => {
    expect(isMachineCompatibleWithCategory("EXTRUDER", "STANDARD")).toBe(true);
  });

  it("accepts REWINDER for PACKING with override", () => {
    const override = { PACKING: ["PACKER", "GRANULATOR", "REWINDER"] };
    expect(isMachineCompatibleWithCategory("REWINDER", "PACKING", override)).toBe(true);
  });
});

describe("filterMachinesByStage", () => {
  const machines = [
    { id: "1", name: "Mixer A", type: "MIXER" },
    { id: "2", name: "Extruder B", type: "EXTRUDER" },
    { id: "3", name: "Packer C", type: "PACKER" },
    { id: "4", name: "Rewinder D", type: "REWINDER" },
  ];

  it("filters for mixing stage", () => {
    expect(filterMachinesByStage(machines, "mixing")).toEqual([
      { id: "1", name: "Mixer A", type: "MIXER" },
    ]);
  });

  it("filters for extrusion stage", () => {
    expect(filterMachinesByStage(machines, "extrusion")).toEqual([
      { id: "2", name: "Extruder B", type: "EXTRUDER" },
      { id: "4", name: "Rewinder D", type: "REWINDER" },
    ]);
  });

  it("returns all for rework stage", () => {
    expect(filterMachinesByStage(machines, "rework")).toEqual(machines);
  });

  it("includes REWINDER for packing with override", () => {
    const override = { PACKING: ["PACKER", "GRANULATOR", "REWINDER"] };
    expect(filterMachinesByStage(machines, "packing", override)).toEqual([
      { id: "3", name: "Packer C", type: "PACKER" },
      { id: "4", name: "Rewinder D", type: "REWINDER" },
    ]);
  });
});

describe("resolveMachineStageMap", () => {
  it("returns default when no override", () => {
    expect(resolveMachineStageMap(null)).toEqual(DEFAULT_CATEGORY_MACHINE_MAP);
    expect(resolveMachineStageMap(undefined)).toEqual(DEFAULT_CATEGORY_MACHINE_MAP);
  });

  it("merges override over default", () => {
    const merged = resolveMachineStageMap({ PACKING: ["PACKER", "REWINDER"] });
    expect(merged.PACKING).toEqual(["PACKER", "REWINDER"]);
    expect(merged.MIXING).toEqual(["MIXER"]);
  });
});

describe("parseMachineStageMap", () => {
  it("returns empty for null/empty", () => {
    expect(parseMachineStageMap(null)).toEqual({});
    expect(parseMachineStageMap("")).toEqual({});
  });

  it("parses valid JSON and drops unknown keys/types", () => {
    const raw = JSON.stringify({
      PACKING: ["PACKER", "REWINDER", "NOPE"],
      BOGUS: ["MIXER"],
      MIXING: "not-array",
    });
    expect(parseMachineStageMap(raw)).toEqual({
      PACKING: ["PACKER", "REWINDER"],
    });
  });

  it("returns empty on malformed JSON", () => {
    expect(parseMachineStageMap("{oops")).toEqual({});
  });
});

describe("PROCESS_MACHINE_FALLBACK", () => {
  it("REWORK contains all five MachineTypes", () => {
    expect(PROCESS_MACHINE_FALLBACK.REWORK).toEqual(
      expect.arrayContaining(["MIXER", "EXTRUDER", "REWINDER", "PACKER", "GRANULATOR"]),
    );
    expect(PROCESS_MACHINE_FALLBACK.REWORK).toHaveLength(5);
  });

  it("CARTON_PACKING contains PACKER and GRANULATOR", () => {
    expect(PROCESS_MACHINE_FALLBACK.CARTON_PACKING).toEqual(
      expect.arrayContaining(["PACKER", "GRANULATOR"]),
    );
    expect(PROCESS_MACHINE_FALLBACK.CARTON_PACKING).toHaveLength(2);
  });
});
