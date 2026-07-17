/**
 * Dual-path material ownership for continuous manufacturing.
 * See docs/production-logic.md §0.
 */

export type MaterialPath = "warehouse_rm" | "floor_wip";

/** Path A = RM warehouse gate. Path B = floor WIP between stages. */
export function resolveMaterialPath(
  category?: string | null,
): MaterialPath {
  if (category === "MIXING") return "warehouse_rm";
  if (
    category === "EXTRUSION" ||
    category === "PACKING" ||
    category === "REWORK"
  ) {
    return "floor_wip";
  }
  // STANDARD / unknown: treat as warehouse-first for RM safety
  return "warehouse_rm";
}

export function isFloorWipCategory(category?: string | null): boolean {
  return resolveMaterialPath(category) === "floor_wip";
}

export function isWarehouseRmCategory(category?: string | null): boolean {
  return resolveMaterialPath(category) === "warehouse_rm";
}
