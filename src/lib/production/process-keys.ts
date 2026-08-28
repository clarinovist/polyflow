export type ProcessKey = 'MIXING' | 'EXTRUSION' | 'PACKING' | 'OTHER';

export const PROCESS_KEYS: ProcessKey[] = [
    'MIXING',
    'EXTRUSION',
    'PACKING',
    'OTHER',
];

/**
 * Map a BOM category to a coarse process bucket.
 * Shared by the production live overview and the daily production report so
 * both surfaces always classify the same execution into the same process.
 */
export function processKeyFromCategory(
    category: string | null | undefined,
): ProcessKey {
    const c = (category || '').toUpperCase();
    if (c === 'MIXING') return 'MIXING';
    if (c === 'EXTRUSION') return 'EXTRUSION';
    if (c === 'PACKING') return 'PACKING';
    return 'OTHER';
}
