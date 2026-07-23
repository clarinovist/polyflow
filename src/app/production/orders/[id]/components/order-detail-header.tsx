"use client";

import { Badge } from "@/components/ui/badge";
import { Factory, Package } from "lucide-react";
import { ProductionStatusBadge } from "@/components/production/production-status-badge";
import { ProductionPriorityBadge } from "@/components/production/production-priority-badge";
import { ExtendedProductionOrder } from "@/components/production/order-detail/types";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Progress } from "@/components/ui/progress";
import { OrderStatusActions } from "./order-status-actions";
import {
  Location,
  Machine,
  Employee,
  WorkShift,
  ProductVariant,
} from "@prisma/client";
import {
  stageFromBomCategory,
  stageLabelId,
} from "@/lib/locations/resolve-location";

interface Props {
  order: ExtendedProductionOrder;
  formData: {
    locations: Location[];
    operators: Employee[];
    helpers: Employee[];
    workShifts: WorkShift[];
    machines: Machine[];
    rawMaterials: ProductVariant[];
  };
}

export function OrderDetailHeader({ order, formData }: Props) {
  const plannedQty = Number(order.plannedQuantity);
  const actualQty = Number(order.actualQuantity || 0);
  const progress = Math.min((actualQty / (plannedQty || 1)) * 100, 100);

  // STANDARD BOMs surface under Extrusion in list filters — don't show as Mixing
  const stageLabel =
    order.bom.category === "STANDARD"
      ? "Standar"
      : stageLabelId(stageFromBomCategory(order.bom.category));
  const productName = order.bom.productVariant.name;
  const bomName = order.bom.name;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="space-y-2 min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight">
              SPK {order.orderNumber}
            </h1>
            <ProductionStatusBadge status={order.status} />
            {order.isMaklon && (
              <Badge
                variant="outline"
                className="border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800/50 dark:bg-blue-900/20 dark:text-blue-400"
              >
                <Factory className="w-3 h-3 mr-1" /> Maklon
              </Badge>
            )}
            <ProductionPriorityBadge priority={order.priority} />
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Package className="w-4 h-4" /> {productName}
            </span>
            <span>•</span>
            <span>Resep: {bomName}</span>
            <span>•</span>
            <span>Stage: {stageLabel}</span>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>Mesin: {order.machine?.code || order.machine?.name || "Belum ditugaskan"}</span>
            <span>•</span>
            <span>Output: {order.location.name}</span>
            <span>•</span>
            <span>
              Rencana: {format(new Date(order.plannedStartDate), "d MMM yyyy", { locale: idLocale })}
              {order.plannedEndDate
                ? ` – ${format(new Date(order.plannedEndDate), "d MMM yyyy", { locale: idLocale })}`
                : ""}
            </span>
          </div>

          <div className="flex items-center gap-2 max-w-xs pt-1">
            <Progress value={progress} className="h-2 w-32" />
            <span className="text-xs text-muted-foreground">
              {actualQty} / {plannedQty} {order.bom.productVariant.primaryUnit} ({progress.toFixed(0)}%)
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <OrderStatusActions order={order} formData={formData as never} />
        </div>
      </div>
    </div>
  );
}
