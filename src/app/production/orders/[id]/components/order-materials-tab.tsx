"use client";

import { Location, ProductVariant } from "@prisma/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { cn } from "@/lib/utils/utils";
import { ExtendedProductionOrder } from "@/components/production/order-detail/types";
import { ChildOrderList } from "@/components/production/order-detail/ChildOrderList";
import { ManualProcurementDialog } from "@/components/production/order-detail/ManualProcurementDialog";
import { BatchIssueMaterialDialog } from "@/components/production/order-detail/BatchIssueMaterialDialog";

interface OrderMaterialsTabProps {
  order: ExtendedProductionOrder;
  formData: {
    locations: Location[];
    rawMaterials: ProductVariant[];
  };
}

export function OrderMaterialsTab({ order, formData }: OrderMaterialsTabProps) {
  const plannedQty = Number(order.plannedQuantity);

  return (
    <div className="space-y-6">
      {/* Sub-Orders Handling */}
      <ChildOrderList order={order} />

      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Material Requirements</h3>
        <div className="flex items-center gap-2">
          <ManualProcurementDialog order={order} />
          {(order.status === "IN_PROGRESS" || order.status === "RELEASED") && (
            <BatchIssueMaterialDialog
              order={order}
              locations={formData.locations}
              rawMaterials={formData.rawMaterials || []}
            />
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="p-3 pl-4">Material</th>
                <th className="p-3 text-right">Plan</th>
                <th className="p-3 text-right w-[25%]">Issued</th>
                <th className="p-3 text-right">Variance</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(order.plannedMaterials || []).map((item) => {
                const manualIssued = (order.materialIssues || [])
                  .filter(
                    (mi) =>
                      mi.productVariantId === item.productVariantId &&
                      mi.status !== "VOIDED",
                  )
                  .reduce((sum: number, mi) => sum + Number(mi.quantity), 0);

                const isBackflushCategory = [
                  "MIXING",
                  "EXTRUSION",
                  "PACKING",
                  "REWORK",
                ].includes(order.bom?.category || "");
                const actualQty = order.actualQuantity
                  ? Number(order.actualQuantity)
                  : 0;

                const hasExplicitIssues =
                  (order.materialIssues || []).filter(
                    (mi) => mi.status !== "VOIDED",
                  ).length > 0;
                let backflushedQty = 0;
                if (
                  !hasExplicitIssues &&
                  isBackflushCategory &&
                  actualQty > 0 &&
                  plannedQty > 0
                ) {
                  backflushedQty =
                    (actualQty / plannedQty) * Number(item.quantity);
                }
                const issued = manualIssued + backflushedQty;
                const required = Number(item.quantity);
                const variance = issued - required;
                const variancePercent =
                  required > 0 ? (variance / required) * 100 : 0;
                const isOver = variance > 0;
                const isUnder = variance < 0;

                let progressColor = "bg-emerald-500 dark:bg-emerald-400";
                if (variancePercent > 5)
                  progressColor = "bg-red-500 dark:bg-red-400";
                else if (variancePercent < -5)
                  progressColor = "bg-amber-500 dark:bg-amber-400";

                const progressValue = Math.min(
                  100,
                  (issued / (required || 1)) * 100,
                );

                return (
                  <tr key={item.id} className="hover:bg-muted/50">
                    <td className="p-3 pl-4">
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground">
                          {item.productVariant.name}
                        </span>
                        <span className="text-[10px] text-blue-600 dark:text-blue-400 font-bold uppercase tracking-wider">
                          Planned
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {item.productVariant.skuCode}
                        </span>
                      </div>
                    </td>
                    <td className="p-3 text-right font-medium text-muted-foreground">
                      {required.toFixed(2)} {item.productVariant.primaryUnit}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex flex-col gap-1 w-full">
                        <span
                          className={cn(
                            "font-bold",
                            isOver
                              ? "text-red-600 dark:text-red-400"
                              : isUnder
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-emerald-600 dark:text-emerald-400",
                          )}
                        >
                          {issued.toFixed(2)} {item.productVariant.primaryUnit}
                        </span>
                        <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                          <div
                            className={cn("h-full rounded-full", progressColor)}
                            style={{ width: `${progressValue}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex flex-col items-end gap-1">
                        <Badge
                          variant="outline"
                          className={cn(
                            "font-mono",
                            isOver
                              ? "text-red-600 border-red-200 bg-red-50 dark:text-red-400 dark:border-red-800/50 dark:bg-red-900/20"
                              : Math.abs(variancePercent) < 0.01
                                ? "text-emerald-600 border-emerald-200 bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800/50 dark:bg-emerald-900/20"
                                : "text-amber-600 border-amber-200 bg-amber-50 dark:text-amber-400 dark:border-amber-800/50 dark:bg-amber-900/20",
                          )}
                        >
                          {variance > 0 ? "+" : ""}
                          {variance.toFixed(2)}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {variance > 0 ? "+" : ""}
                          {variancePercent.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {/* Handle Substitute Materials */}
              {(order.materialIssues || [])
                .filter(
                  (mi) =>
                    mi.status !== "VOIDED" &&
                    !(order.plannedMaterials || []).some(
                      (pm) => pm.productVariantId === mi.productVariantId,
                    ),
                )
                .reduce(
                  (
                    acc: {
                      productVariantId: string;
                      productVariant: {
                        name: string;
                        skuCode?: string;
                        primaryUnit: string;
                      };
                      quantity: number;
                    }[],
                    mi,
                  ) => {
                    const existing = acc.find(
                      (a) => a.productVariantId === mi.productVariantId,
                    );
                    if (existing) {
                      existing.quantity += Number(mi.quantity);
                    } else {
                      acc.push({
                        productVariantId: mi.productVariantId,
                        productVariant: {
                          name: mi.productVariant.name,
                          skuCode: mi.productVariant.skuCode,
                          primaryUnit: mi.productVariant.primaryUnit,
                        },
                        quantity: Number(mi.quantity),
                      });
                    }
                    return acc;
                  },
                  [],
                )
                .map((sub) => (
                  <tr
                    key={sub.productVariantId}
                    className="bg-amber-500/10 hover:bg-amber-500/20 dark:bg-amber-500/15 dark:hover:bg-amber-500/25"
                  >
                    <td className="p-3 pl-4">
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground">
                          {sub.productVariant.name}
                        </span>
                        <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold uppercase tracking-wider">
                          Unplanned Issue
                        </span>
                      </div>
                    </td>
                    <td className="p-3 text-right text-muted-foreground">-</td>
                    <td className="p-3 text-right">
                      <span className="font-bold text-amber-600 dark:text-amber-400">
                        {Number(sub.quantity).toFixed(2)}{" "}
                        {sub.productVariant.primaryUnit}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <Badge
                        variant="outline"
                        className="text-amber-600 border-amber-200 bg-amber-50 dark:text-amber-400 dark:border-amber-800/50 dark:bg-amber-900/20"
                      >
                        Substitute
                      </Badge>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="mt-6">
        <h3 className="text-lg font-semibold mb-3">Issue History</h3>
        {order.materialIssues.length === 0 ? (
          <p className="text-muted-foreground italic">
            No materials issued yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {order.materialIssues.map((issue) => (
              <div
                key={issue.id}
                className={cn(
                  "flex justify-between items-center p-3 bg-card rounded-lg border shadow-sm hover:border-border transition-colors",
                  issue.status === "VOIDED" &&
                    "opacity-50 line-through bg-muted/30",
                )}
              >
                <div className="flex flex-col">
                  <span className="font-medium text-foreground">
                    {issue.productVariant.name}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">
                      {format(new Date(issue.issuedAt), "PP p")}
                    </span>
                    {issue.status === "VOIDED" && (
                      <span className="text-[10px] font-bold text-destructive uppercase tracking-tighter">
                        Voided
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono bg-muted px-2 py-1 rounded text-xs font-semibold">
                    {Number(issue.quantity)} {issue.productVariant.primaryUnit}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
