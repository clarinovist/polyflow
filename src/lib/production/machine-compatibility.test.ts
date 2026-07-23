import { describe, it, expect } from "vitest";
import {
  getCompatibleMachineTypes,
  isMachineCompatibleWithCategory,
  filterMachinesByStage,
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
});

describe("filterMachinesByStage", () => {
  const machines = [
    { id: "1", name: "Mixer A", type: "MIXER" },
    { id: "2", name: "Extruder B", type: "EXTRUDER" },
    { id: "3", name: "Packer C", type: "PACKER" },
  ];

  it("filters for mixing stage", () => {
    expect(filterMachinesByStage(machines, "mixing")).toEqual([
      { id: "1", name: "Mixer A", type: "MIXER" },
    ]);
  });

  it("filters for extrusion stage", () => {
    expect(filterMachinesByStage(machines, "extrusion")).toEqual([
      { id: "2", name: "Extruder B", type: "EXTRUDER" },
    ]);
  });

  it("returns all for rework stage", () => {
    expect(filterMachinesByStage(machines, "rework")).toEqual(machines);
  });
});
