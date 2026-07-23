/**
 * Planning intent — single source of truth for production quantity.
 *
 * Three modes:
 * - base: direct base-unit entry (e.g., KG)
 * - sales: entered in sales unit (e.g., BAL), converted to base
 * - batch: number of BOM batches, multiplied by BOM output qty
 */

export type PlanningIntent =
  | { mode: "base"; baseQty: number }
  | { mode: "sales"; enteredQty: number; salesUnit: string; factor: number }
  | { mode: "batch"; batchCount: number; bomOutputQty: number };

/**
 * Resolve the effective planned quantity (in base unit) from a planning intent.
 */
export function resolvePlannedQuantity(intent: PlanningIntent): number {
  switch (intent.mode) {
    case "base":
      return intent.baseQty;
    case "sales":
      return intent.enteredQty * intent.factor;
    case "batch":
      return intent.batchCount * intent.bomOutputQty;
  }
}

/**
 * Human-readable summary of the planning intent (for review step).
 */
export function describePlanningIntent(intent: PlanningIntent): string {
  switch (intent.mode) {
    case "base":
      return `${intent.baseQty} (dasar)`;
    case "sales":
      return `${intent.enteredQty} ${intent.salesUnit} × ${intent.factor} = ${resolvePlannedQuantity(intent)}`;
    case "batch":
      return `${intent.batchCount} batch × ${intent.bomOutputQty} = ${resolvePlannedQuantity(intent)}`;
  }
}
