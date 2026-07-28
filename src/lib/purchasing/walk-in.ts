/** Machine-readable marker on auto-PO notes from warehouse walk-in. */
export const WALK_IN_NOTE_PREFIX = '[WAREHOUSE_WALK_IN]';

export function isWalkInPurchaseOrderNotes(
    notes: string | null | undefined,
): boolean {
    return Boolean(notes?.includes(WALK_IN_NOTE_PREFIX));
}

/** Check if PO is walk-in based on entry source (preferred) or notes (legacy). */
export function isWalkInPurchaseOrder(
    entrySource?: string | null,
    notes?: string | null | undefined,
): boolean {
    if (entrySource === 'WALK_IN_RECEIPT') return true;
    return isWalkInPurchaseOrderNotes(notes);
}

/** Check if SO is emergency dispatch based on entry source or notes. */
export function isEmergencyDispatch(
    entrySource?: string | null,
    notes?: string | null | undefined,
): boolean {
    if (entrySource === 'EMERGENCY_DISPATCH') return true;
    return Boolean(notes?.includes('[EMERGENCY_DISPATCH]'));
}
