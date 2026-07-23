"use client";

import { Button } from "@/components/ui/button";
import { FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { formatProductionQuantity } from "@/lib/utils/production-units";
import type { PlanningMode } from "../hooks/use-planning-intent";

interface PlanningQuantitySectionProps {
  planningMode: PlanningMode;
  onPlanningModeChange: (mode: PlanningMode) => void;
  batchCount: number;
  onBatchCountChange: (n: number) => void;
  enteredTargetQty: number;
  onEnteredTargetQtyChange: (n: number) => void;
  /** Base-unit input for weight mode */
  basePlannedQty: number;
  onBasePlannedQtyChange: (n: number) => void;
  bomOutputQty: number;
  bomPrimaryUnit: string;
  bomProductVariant: Record<string, unknown>;
  hasAlternateUnit: boolean;
  salesUnit: string;
  conversionFactor: number;
}

export function PlanningQuantitySection({
  planningMode,
  onPlanningModeChange,
  batchCount,
  onBatchCountChange,
  enteredTargetQty,
  onEnteredTargetQtyChange,
  basePlannedQty,
  onBasePlannedQtyChange,
  bomOutputQty,
  bomPrimaryUnit,
  bomProductVariant,
  hasAlternateUnit,
  salesUnit,
  conversionFactor,
}: PlanningQuantitySectionProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Planning Mode */}
      <div className="space-y-3">
        <FormLabel>Metode target</FormLabel>
        <div className="flex rounded-md shadow-sm" role="group" aria-label="Metode target">
          <Button
            type="button"
            variant={planningMode === "weight" ? "default" : "outline"}
            className="rounded-r-none h-9 flex-1 text-xs"
            onClick={() => onPlanningModeChange("weight")}
            aria-pressed={planningMode === "weight"}
          >
            By {bomPrimaryUnit || "Base"}
          </Button>
          {hasAlternateUnit && (
            <Button
              type="button"
              variant={planningMode === "sales" ? "default" : "outline"}
              className="rounded-none h-9 flex-1 text-xs border-l-0"
              onClick={() => onPlanningModeChange("sales")}
              aria-pressed={planningMode === "sales"}
            >
              By {salesUnit}
            </Button>
          )}
          <Button
            type="button"
            variant={planningMode === "batch" ? "default" : "outline"}
            className="rounded-l-none h-9 flex-1 text-xs border-l-0"
            onClick={() => onPlanningModeChange("batch")}
            aria-pressed={planningMode === "batch"}
          >
            By Batch
          </Button>
        </div>
      </div>

      {/* Target Input */}
      <div className="flex flex-col justify-end">
        {planningMode === "batch" ? (
          <div className="space-y-2">
            <FormLabel>Total Batch</FormLabel>
            <Input
              type="number"
              value={batchCount.toString()}
              onChange={(e) => {
                const val = e.target.value;
                onBatchCountChange(val === "" ? 0 : Number(val));
              }}
              min={1}
            />
            <p className="text-xs text-muted-foreground">
              {bomOutputQty > 0
                ? `${batchCount} × ${bomOutputQty} = ${formatProductionQuantity(bomOutputQty * batchCount, bomProductVariant)}`
                : "Pilih resep dulu"}
            </p>
          </div>
        ) : planningMode === "sales" && hasAlternateUnit ? (
          <div className="space-y-2">
            <FormLabel>Target Output ({salesUnit})</FormLabel>
            <Input
              type="number"
              step="0.01"
              value={enteredTargetQty.toString()}
              onChange={(e) => {
                const next = e.target.value === "" ? 0 : Number(e.target.value);
                onEnteredTargetQtyChange(next);
              }}
            />
            <p className="text-xs text-muted-foreground">
              {enteredTargetQty > 0
                ? `=${formatProductionQuantity(enteredTargetQty * conversionFactor, bomProductVariant)} (dasar)`
                : `1 ${salesUnit} = ${conversionFactor} ${bomPrimaryUnit}`}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <FormLabel>Target Output ({bomPrimaryUnit || "Base Unit"})</FormLabel>
            <Input
              type="number"
              step="0.01"
              value={basePlannedQty || ""}
              onChange={(e) => onBasePlannedQtyChange(Number(e.target.value) || 0)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
