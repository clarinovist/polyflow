/**
 * Machine type compatibility with BOM category / production stage.
 * Shared between QuickProduceDialog and create-SPK form.
 */

type MachineType = string;

const CATEGORY_MACHINE_MAP: Record<string, readonly MachineType[]> = {
  MIXING: ["MIXER"],
  EXTRUSION: ["EXTRUDER", "REWINDER"],
  PACKING: ["PACKER", "GRANULATOR"],
  REWORK: ["MIXER", "EXTRUDER", "REWINDER", "PACKER", "GRANULATOR"],
  STANDARD: ["EXTRUDER", "MIXER"],
};

/**
 * Get compatible machine types for a BOM category.
 */
export function getCompatibleMachineTypes(bomCategory: string): readonly MachineType[] {
  return CATEGORY_MACHINE_MAP[bomCategory] || [];
}

/**
 * Check if a machine type is compatible with a BOM category.
 */
export function isMachineCompatibleWithCategory(
  machineType: MachineType,
  bomCategory: string,
): boolean {
  return getCompatibleMachineTypes(bomCategory).includes(machineType);
}

/**
 * Filter machines compatible with a production stage (maps stage → category).
 */
export function filterMachinesByStage<
  T extends { type: string },
>(machines: T[], stage: "mixing" | "extrusion" | "packing" | "rework"): T[] {
  const stageToCategory: Record<string, string> = {
    mixing: "MIXING",
    extrusion: "EXTRUSION",
    packing: "PACKING",
    rework: "REWORK",
  };
  const category = stageToCategory[stage];
  if (!category) return machines;
  const allowed = getCompatibleMachineTypes(category);
  return machines.filter((m) => allowed.includes(m.type));
}
