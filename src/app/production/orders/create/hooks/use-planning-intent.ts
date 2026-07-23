import { useState, useCallback } from "react";
import {
  resolvePlannedQuantity,
  type PlanningIntent,
} from "../lib/planning-intent";
import { toBaseQuantity, getProductionUnitMeta } from "@/lib/utils/production-units";

export type PlanningMode = "weight" | "sales" | "batch";

interface UsePlanningIntentArgs {
  bomOutputQty: number;
  productVariant: Record<string, unknown>;
  /** Current base-unit qty from form field (for weight mode intent accuracy) */
  baseQty?: number;
}

interface UsePlanningIntentReturn {
  planningMode: PlanningMode;
  setPlanningMode: (mode: PlanningMode) => void;
  batchCount: number;
  setBatchCount: (n: number) => void;
  enteredTargetQty: number;
  setEnteredTargetQty: (n: number) => void;
  /** Effective planned quantity in base unit */
  plannedQuantity: number;
  /** Current planning intent object */
  intent: PlanningIntent;
  /** Sales-unit metadata (if product has alternate unit) */
  unitMeta: ReturnType<typeof getProductionUnitMeta>;
  /** Reset all planning state (e.g., on stage/product change) */
  reset: () => void;
}

export function usePlanningIntent({
  bomOutputQty,
  productVariant,
  baseQty = 0,
}: UsePlanningIntentArgs): UsePlanningIntentReturn {
  const [planningMode, setPlanningMode] = useState<PlanningMode>("weight");
  const [batchCount, setBatchCount] = useState<number>(1);
  const [enteredTargetQty, setEnteredTargetQty] = useState<number>(0);

  const unitMeta = getProductionUnitMeta(productVariant);

  const intent = ((): PlanningIntent => {
    if (planningMode === "batch") {
      return { mode: "batch", batchCount, bomOutputQty };
    }
    if (planningMode === "sales" && unitMeta.hasAlternateUnit) {
      return {
        mode: "sales",
        enteredQty: enteredTargetQty,
        salesUnit: unitMeta.salesUnit || "",
        factor: unitMeta.conversionFactor,
      };
    }
    // weight (base) — use real form value
    return { mode: "base", baseQty };
  })();

  const plannedQuantity =
    planningMode === "batch"
      ? resolvePlannedQuantity(intent)
      : planningMode === "sales" && unitMeta.hasAlternateUnit
        ? toBaseQuantity(enteredTargetQty, unitMeta.conversionFactor)
        : baseQty; // weight mode: use real form value

  const reset = useCallback(() => {
    setPlanningMode("weight");
    setBatchCount(1);
    setEnteredTargetQty(0);
  }, []);

  return {
    planningMode,
    setPlanningMode,
    batchCount,
    setBatchCount,
    enteredTargetQty,
    setEnteredTargetQty,
    plannedQuantity,
    intent,
    unitMeta,
    reset,
  };
}
