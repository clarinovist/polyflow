/**
 * Machine type compatibility with BOM category / production stage.
 * Shared between QuickProduceDialog and create-SPK form.
 * Now also supports process-based capability with legacy fallback.
 *
 * Stage→type mapping can be overridden per tenant via AppSetting
 * (`production.machineStageMap`). All functions accept an optional
 * override map; absent keys fall back to DEFAULT_CATEGORY_MACHINE_MAP.
 */

type MachineType = string;

export type MachineStageMap = Record<string, readonly MachineType[]>;

export const DEFAULT_CATEGORY_MACHINE_MAP: MachineStageMap = {
    MIXING: ['MIXER'],
    EXTRUSION: ['EXTRUDER', 'REWINDER'],
    PACKING: ['PACKER', 'GRANULATOR'],
    REWORK: ['MIXER', 'EXTRUDER', 'REWINDER', 'PACKER', 'GRANULATOR'],
    STANDARD: ['EXTRUDER', 'MIXER'],
};

/** Known machine types — used to validate overrides from AppSetting. */
export const KNOWN_MACHINE_TYPES: readonly string[] = [
    'MIXER',
    'EXTRUDER',
    'REWINDER',
    'PACKER',
    'GRANULATOR',
];

/** Stage keys that may be configured per tenant. */
export const STAGE_KEYS: readonly string[] = Object.keys(
    DEFAULT_CATEGORY_MACHINE_MAP,
);

/** AppSetting key storing per-tenant machine stage map (JSON). */
export const MACHINE_STAGE_MAP_SETTING_KEY = 'production.machineStageMap';

/**
 * Resolve effective map: override wins per key, default fills the rest.
 */
export function resolveMachineStageMap(
    overrideMap?: MachineStageMap | null,
): MachineStageMap {
    if (!overrideMap) return DEFAULT_CATEGORY_MACHINE_MAP;
    const merged: MachineStageMap = { ...DEFAULT_CATEGORY_MACHINE_MAP };
    for (const key of Object.keys(overrideMap)) {
        const types = overrideMap[key];
        if (types && types.length > 0) merged[key] = types;
    }
    return merged;
}

/**
 * Parse raw AppSetting JSON value into a validated MachineStageMap.
 * Never throws — malformed input falls back to default map.
 */
export function parseMachineStageMap(
    raw: string | null | undefined,
): MachineStageMap {
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return {};
        }
        const result: MachineStageMap = {};
        for (const key of Object.keys(parsed)) {
            if (!STAGE_KEYS.includes(key)) continue;
            const types = parsed[key];
            if (!Array.isArray(types)) continue;
            const valid = types.filter(
                (t): t is string =>
                    typeof t === 'string' && KNOWN_MACHINE_TYPES.includes(t),
            );
            if (valid.length > 0) result[key] = valid;
        }
        return result;
    } catch {
        return {};
    }
}

/**
 * Get compatible machine types for a BOM category.
 * Uses per-tenant override when provided, otherwise default map.
 */
export function getCompatibleMachineTypes(
    bomCategory: string,
    overrideMap?: MachineStageMap | null,
): readonly MachineType[] {
    const map = resolveMachineStageMap(overrideMap);
    return map[bomCategory] || [];
}

/**
 * Check if a machine type is compatible with a BOM category.
 */
export function isMachineCompatibleWithCategory(
    machineType: MachineType,
    bomCategory: string,
    overrideMap?: MachineStageMap | null,
): boolean {
    return getCompatibleMachineTypes(bomCategory, overrideMap).includes(
        machineType,
    );
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
    overrideMap?: MachineStageMap | null,
): T[] {
    const stageToCategory: Record<string, string> = {
        mixing: 'MIXING',
        extrusion: 'EXTRUSION',
        packing: 'PACKING',
        rework: 'REWORK',
    };
    const category = stageToCategory[stage];
    if (!category) return machines;
    const allowed = getCompatibleMachineTypes(category, overrideMap);
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
