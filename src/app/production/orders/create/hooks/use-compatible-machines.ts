import { useMemo } from 'react';
import {
    filterMachinesByStage,
    MachineStageMap,
} from '@/lib/production/machine-compatibility';

type ProductionStage = 'mixing' | 'extrusion' | 'packing' | 'rework';

interface Machine {
    id: string;
    name: string;
    type: string;
}

/**
 * Filter machines compatible with a production stage.
 * Uses shared machine-compatibility utility with optional per-tenant override.
 */
export function useCompatibleMachines(
    machines: Machine[],
    stage: ProductionStage,
    overrideMap?: MachineStageMap | null,
): Machine[] {
    return useMemo(
        () => filterMachinesByStage(machines, stage, overrideMap),
        [machines, stage, overrideMap],
    );
}
