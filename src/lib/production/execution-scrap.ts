/**
 * Total scrap/affal of a ProductionExecution row.
 *
 * Affal is stored in TWO shapes depending on the entry path:
 * - Main form (AddOutputDialog / execution service): dedicated columns
 *   `scrapProngkolQty` + `scrapDaunQty`, generic `scrapQuantity` left 0.
 * - Kiosk (KioskLogOutputDialog): generic `scrapQuantity` is written as the
 *   DUPLICATE aggregate of prongkol + daun.
 *
 * Verified invariant (2026-08-28, both production tenants):
 * every row where generic > 0 alongside prongkol/daun satisfies
 * `scrapQuantity == scrapProngkolQty + scrapDaunQty` exactly. Therefore
 * summing the three columns would double-count kiosk rows; max() is exact
 * for both shapes.
 */
export function executionScrapTotal(exec: {
    scrapQuantity?: unknown;
    scrapProngkolQty?: unknown;
    scrapDaunQty?: unknown;
}): number {
    const generic = Number(exec.scrapQuantity ?? 0);
    const prongkol = Number(exec.scrapProngkolQty ?? 0);
    const daun = Number(exec.scrapDaunQty ?? 0);
    return Math.max(generic, prongkol + daun);
}
