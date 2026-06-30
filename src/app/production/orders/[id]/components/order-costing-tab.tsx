"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Calculator, Info, TrendingUp as TrendingUpIcon } from "lucide-react";
import { formatRupiah } from "@/lib/utils/utils";
import { ExtendedProductionOrder } from "@/components/production/order-detail/types";
import { MaklonCostManager } from "@/components/maklon/MaklonCostManager";

interface OrderCostingTabProps {
  order: ExtendedProductionOrder;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  costingData: any;
  loadingCosting: boolean;
}

export function OrderCostingTab({
  order,
  costingData,
  loadingCosting,
}: OrderCostingTabProps) {
  return (
    <div className="space-y-6">
      {/* Maklon Conversion Costs – only for Maklon orders */}
      {order.isMaklon && (
        <MaklonCostManager
          productionOrderId={order.id}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          initialItems={(order as any).maklonCostItems ?? []}
        />
      )}

      {loadingCosting ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Calculator className="w-8 h-8 animate-pulse mb-2" />
          <p>Calculating batch costs...</p>
        </div>
      ) : costingData ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Calculator className="w-4 h-4" /> Cost Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">
                    Material Cost
                  </p>
                  <p className="text-xl font-bold">
                    {formatRupiah(costingData.materialCost)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">
                    Conversion Cost
                  </p>
                  <p className="text-xl font-bold">
                    {formatRupiah(costingData.conversionCost)}
                  </p>
                </div>
              </div>
              <div className="pt-4 border-t">
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">
                      Total COGM
                    </p>
                    <p className="text-2xl font-black text-blue-600 dark:text-blue-400">
                      {formatRupiah(costingData.totalCost)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">
                      Unit Cost
                    </p>
                    <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                      {formatRupiah(costingData.unitCost)}{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        / {order.bom.productVariant.primaryUnit}
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Info className="w-4 h-4" /> Insights
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Material %</span>
                  <span className="font-medium">
                    {(
                      (costingData.materialCost / costingData.totalCost) *
                      100
                    ).toFixed(1)}
                    %
                  </span>
                </div>
                <Progress
                  value={
                    (costingData.materialCost / costingData.totalCost) * 100
                  }
                  className="h-1.5"
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Conversion %</span>
                  <span className="font-medium">
                    {(
                      (costingData.conversionCost / costingData.totalCost) *
                      100
                    ).toFixed(1)}
                    %
                  </span>
                </div>
                <Progress
                  value={
                    (costingData.conversionCost / costingData.totalCost) * 100
                  }
                  className="h-1.5 bg-amber-100 dark:bg-amber-900/30"
                />
              </div>
              <div className="mt-4 p-3 bg-zinc-50 rounded-lg border text-xs text-muted-foreground dark:bg-zinc-800">
                <p className="flex items-center gap-1 font-medium text-zinc-900 mb-1 dark:text-zinc-100">
                  <TrendingUpIcon className="w-3 h-3 text-blue-500 dark:text-blue-400" />{" "}
                  WAC-based Valuation
                </p>
                Material costs are calculated using the Weighted Average Cost at
                the time of issuance.
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-xl">
          <Calculator className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p>Belum ada data costing untuk order ini.</p>
          <p className="text-xs mt-1">
            Costs are aggregated once materials are issued or output is
            recorded.
          </p>
        </div>
      )}
    </div>
  );
}
