import { useMemo } from "react";
import { filterMachinesByStage } from "@/lib/production/machine-compatibility";

type ProductionStage = "mixing" | "extrusion" | "packing" | "rework";

interface Machine {
  id: string;
  name: string;
  type: string;
}

/**
 * Filter machines compatible with a production stage.
 * Uses shared machine-compatibility utility.
 */
export function useCompatibleMachines(
  machines: Machine[],
  stage: ProductionStage,
): Machine[] {
  return useMemo(() => filterMachinesByStage(machines, stage), [machines, stage]);
}
