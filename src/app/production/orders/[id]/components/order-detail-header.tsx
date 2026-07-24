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
import { ReassignMachineButton } from "@/components/production/ReassignMachineButton";
import { ReassignOutputLocationButton } from "@/components/production/ReassignOutputLocationButton";
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

  const stageLabel =
    order.bom.category === "STANDARD"
      ? "Standar"
      : stageLabelId(stageFromBomCategory(order.bom.category));
  const productName = order.bom.productVariant.name;
  const bomName = order.bom.name;

  const totalMaterials = order.plannedMaterials?.length || 0;
  const readyMaterials =
    order.plannedMaterials?.filter((m) => {
      const issued = (order.materialIssues || [])
        .filter(
          (mi) =>
            mi.productVariantId === m.productVariantId &&
            mi.status !== "VOIDED",
        )
        .reduce((sum, mi) => sum + Number(mi.quantity), 0);
      return issued >= Number(m.quantity);
    }).length || 0;
  const allMaterialsReady = totalMaterials > 0 && readyMaterials === totalMaterials;

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
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
            <span>·</span>
            <span>Resep: {bomName}</span>
            <span>·</span>
            <span>Stage: {stageLabel}</span>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              Mesin:{" "}
              <span className="font-medium text-foreground">
                {order.machine?.code || order.machine?.name || "Belum ditugaskan"}
              </span>
              <ReassignMachineButton
                orderId={order.id}
                orderNumber={order.orderNumber}
                currentMachineId={order.machine?.id || null}
                machines={formData.machines}
              />
            </span>
            <span>·</span>
            <span className="flex items-center gap-1">
              Output:{" "}
              <span className="font-medium text-foreground">
                {order.location.name}
              </span>
              <ReassignOutputLocationButton
                orderId={order.id}
                orderNumber={order.orderNumber}
                orderStatus={order.status}
                currentLocationId={order.locationId}
                currentLocationName={order.location.name}
                locations={formData.locations}
              />
            </span>
            <span>·</span>
            <span>
              Rencana:{" "}
              {format(new Date(order.plannedStartDate), "d MMM yyyy", {
                locale: idLocale,
              })}
              {order.plannedEndDate
                ? ` – ${format(new Date(order.plannedEndDate), "d MMM yyyy", { locale: idLocale })}`
                : ""}
            </span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-end gap-4 shrink-0">
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <Progress value={progress} className="h-2 w-28" />
              <span className="text-xs font-medium text-muted-foreground">
                {actualQty} / {plannedQty}{" "}
                {order.bom.productVariant.primaryUnit} (
                {progress.toFixed(0)}%)
              </span>
            </div>
            {totalMaterials > 0 && (
              <div className="flex items-center gap-1.5">
                <Package className="w-3 h-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  Bahan Baku:
                </span>
                {allMaterialsReady ? (
                  <Badge
                    variant="outline"
                    className="text-[10px] font-medium border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-900/20 dark:text-emerald-400"
                  >
                    Siap ({readyMaterials}/{totalMaterials})
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="text-[10px] font-medium border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/50 dark:bg-amber-900/20 dark:text-amber-400"
                  >
                    Menunggu ({readyMaterials}/{totalMaterials})
                  </Badge>
                )}
              </div>
            )}
          </div>
          <OrderStatusActions order={order} formData={formData as never} />
        </div>
      </div>
    </div>
  );
}
