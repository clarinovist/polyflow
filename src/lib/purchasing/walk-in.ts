/** Machine-readable marker on auto-PO notes from warehouse walk-in. */
export const WALK_IN_NOTE_PREFIX = "[WAREHOUSE_WALK_IN]";

export function isWalkInPurchaseOrderNotes(
  notes: string | null | undefined,
): boolean {
  return Boolean(notes?.includes(WALK_IN_NOTE_PREFIX));
}
