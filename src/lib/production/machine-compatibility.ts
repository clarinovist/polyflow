/**
 * Machine type compatibility with BOM category / production stage.
 * Shared between QuickProduceDialog and create-SPK form.
 * Now also supports process-based capability with legacy fallback.
 */

type MachineType = string;

const CATEGORY_MACHINE_MAP: Record<string, readonly MachineType[]> = {
    MIXING: ['MIXER'],
    EXTRUSION: ['EXTRUDER', 'REWINDER'],
    PACKING: ['PACKER', 'GRANULATOR'],
    REWORK: ['MIXER', 'EXTRUDER', 'REWINDER', 'PACKER', 'GRANULATOR'],
    STANDARD: ['EXTRUDER', 'MIXER'],
};

/**
 * Get compatible machine types for a BOM category (legacy fallback).
 */
export function getCompatibleMachineTypes(
    bomCategory: string,
): readonly MachineType[] {
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
 * ProcessCode → default MachineTypes fallback when capability table empty.
 * Used as secondary fallback for routed orders.
 * Seed script derives its MachineType → ProcessCode map by inverting this table.
 */
export const PROCESS_MACHINE_FALLBACK: Record<string, readonly MachineType[]> = {
    MIXING: ['MIXER'],
    EXTRUSION: ['EXTRUDER', 'REWINDER'],
    INNER_PACKING: ['PACKER'],
    CARTON_PACKING: ['PACKER', 'GRANULATOR'],
    PACKING: ['PACKER', 'GRANULATOR'],
    STERILIZATION: [], // manual process, no machine required
    INJECTION: ['EXTRUDER'], // injection often uses extruder-like machine or dedicated
    WINDING: ['REWINDER'],
    TRIMMING: ['GRANULATOR'],
    STANDARD: ['EXTRUDER', 'MIXER'],
    REWORK: ['MIXER', 'EXTRUDER', 'REWINDER', 'PACKER', 'GRANULATOR'],
};

export function getFallbackMachineTypesForProcess(processCode: string): readonly MachineType[] {
    return PROCESS_MACHINE_FALLBACK[processCode?.toUpperCase()] ?? [];
}

/**
 * Filter machines compatible with a production stage (maps stage → category).
 */
export function filterMachinesByStage<T extends { type: string }>(
    machines: T[],
    stage: 'mixing' | 'extrusion' | 'packing' | 'rework',
): T[] {
    const stageToCategory: Record<string, string> = {
        mixing: 'MIXING',
        extrusion: 'EXTRUSION',
        packing: 'PACKING',
        rework: 'REWORK',
    };
    const category = stageToCategory[stage];
    if (!category) return machines;
    const allowed = getCompatibleMachineTypes(category);
    return machines.filter((m) => allowed.includes(m.type));
}

/**
 * Filter machines compatible with a process using capability list (primary) + fallback (secondary)
 */
export function filterMachinesByProcess<T extends { id: string; type: string }>(
    machines: T[],
    processCode?: string | null,
    capableMachineIds?: Set<string>,
): T[] {
    if (capableMachineIds && capableMachineIds.size > 0) {
        return machines.filter((m) => capableMachineIds.has(m.id));
    }
    if (processCode) {
        const fallback = getFallbackMachineTypesForProcess(processCode);
        if (fallback.length > 0) return machines.filter((m) => fallback.includes(m.type));
    }
    return machines;
}
