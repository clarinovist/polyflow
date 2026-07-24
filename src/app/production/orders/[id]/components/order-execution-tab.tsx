"use client";

import { Machine, Location, Employee, WorkShift, ProductVariant } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import Link from "next/link";
import { Play, CheckCircle, TrendingUp as TrendingUpIcon, Package, Info, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils/utils";
import { ShiftManager } from "@/components/production/ShiftManager";
import { ExtendedProductionOrder } from "@/components/production/order-detail/types";
import { RecordScrapDialog } from "@/components/production/order-detail/RecordScrapDialog";
import { DeleteScrapButton } from "@/components/production/order-detail/DeleteScrapButton";
import { RecordQCDialog } from "@/components/production/order-detail/RecordQCDialog";
import { ChildOrderList } from "@/components/production/order-detail/ChildOrderList";
import { ManualProcurementDialog } from "@/components/production/order-detail/ManualProcurementDialog";
import { BatchIssueMaterialDialog } from "@/components/production/order-detail/BatchIssueMaterialDialog";
import { resolveMaterialPath } from "@/lib/production/material-path";

interface OrderExecutionTabProps {
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

export function OrderExecutionTab({ order, formData }: OrderExecutionTabProps) {
  const category = order.bom?.category || "";
  const materialPath = resolveMaterialPath(category);
  const isFloorPath = materialPath === "floor_wip";
  const isWaitingMaterial = order.status === "WAITING_MATERIAL";
  const isActive =
    order.status === "IN_PROGRESS" ||
    order.status === "RELEASED" ||
    order.status === "WAITING_MATERIAL";

  return (
    <div className="space-y-6">
      {/* Materials Section */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="w-4 h-4" /> Kebutuhan Bahan
            </CardTitle>
            <div className="flex items-center gap-2">
              <ManualProcurementDialog order={order} />
              {isActive && isFloorPath && (
                <BatchIssueMaterialDialog
                  order={order}
                  locations={formData.locations}
                  rawMaterials={formData.rawMaterials || []}
                />
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <ChildOrderList order={order} />

          {isWaitingMaterial && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-start gap-3 dark:border-amber-800/50 dark:bg-amber-900/20">
              <Package className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                  SPK menunggu bahan
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                  Hubungi Gudang untuk issue bahan sebelum Rilis.
                </p>
                <Button
                  variant="link"
                  className="h-auto p-0 text-xs text-amber-700 dark:text-amber-300 mt-2"
                  asChild
                >
                  <Link href="/warehouse" className="inline-flex items-center gap-1">
                    Buka Gudang
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </Button>
              </div>
            </div>
          )}

          {isActive && !isWaitingMaterial && (
            <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-2">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <div className="space-y-1.5">
                  {isFloorPath ? (
                    <>
                      <p className="font-medium">
                        Jalur bahan: Staging lantai (Path B)
                      </p>
                      <p className="text-muted-foreground text-xs leading-relaxed">
                        WIP hasil mixing dapat di-staging di lantai. Ambil dari lantai saat produksi Extrusion/Packing.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-medium">
                        Jalur bahan: Gudang (Path A)
                      </p>
                      <p className="text-muted-foreground text-xs leading-relaxed">
                        Issue bahan baku dilakukan di Gudang. SPK menunggu bahan hingga semua kebutuhan tersedia.
                      </p>
                    </>
                  )}
                  <Button variant="link" className="h-auto p-0 text-xs" asChild>
                    <Link href="/warehouse" className="inline-flex items-center gap-1">
                      Buka Gudang untuk bahan baku
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="p-3 pl-4">Bahan</th>
                  <th className="p-3 text-right">Rencana</th>
                  <th className="p-3 text-right">Keluar</th>
                  <th className="p-3 text-right">Selisih</th>
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
                  const plannedQty = Number(order.plannedQuantity);

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
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {order.materialIssues.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-3">Riwayat Pengeluaran</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {order.materialIssues.map((issue) => (
                  <div
                    key={issue.id}
                    className={cn(
                      "flex justify-between items-center p-3 bg-card rounded-lg border shadow-sm",
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
                          {format(new Date(issue.issuedAt), "d MMM yyyy HH:mm", { locale: idLocale })}
                        </span>
                        {issue.status === "VOIDED" && (
                          <span className="text-[10px] font-bold text-destructive uppercase tracking-tighter">
                            Void
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="font-mono bg-muted px-2 py-1 rounded text-xs font-semibold">
                      {Number(issue.quantity)} {issue.productVariant.primaryUnit}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Shift Management Section */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Play className="w-4 h-4 text-blue-500 dark:text-blue-400" />{" "}
            Sumber Daya Operasional
          </h3>
        </div>
        <ShiftManager
          orderId={order.id}
          shifts={order.shifts || []}
          operators={formData.operators}
          helpers={formData.helpers}
          readOnly={
            order.status === "COMPLETED" || order.status === "CANCELLED"
          }
          workShifts={formData.workShifts}
          machines={formData.machines}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Logs and Quality Section */}
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <TrendingUpIcon className="w-4 h-4 text-amber-500 dark:text-amber-400" />{" "}
              Produksi & Scrap
            </h3>
            {order.status === "IN_PROGRESS" && (
              <RecordScrapDialog order={order} locations={formData.locations} />
            )}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Catatan Scrap
              </CardTitle>
            </CardHeader>
            <CardContent>
              {order.scrapRecords.length === 0 ? (
                <p className="text-muted-foreground text-sm italic py-4">
                  Belum ada scrap tercatat untuk SPK ini.
                </p>
              ) : (
                <ul className="space-y-2">
                  {order.scrapRecords.map((scrap) => (
                    <li
                      key={scrap.id}
                      className="flex justify-between items-center text-sm border-b pb-2 last:border-0"
                    >
                      <div>
                        <p className="font-medium">
                          {scrap.productVariant.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {scrap.reason || "Tanpa alasan"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className="text-red-600 border-red-200 bg-red-50 dark:text-red-400 dark:border-red-800/50 dark:bg-red-900/20"
                        >
                          {Number(scrap.quantity)}{" "}
                          {scrap.productVariant.primaryUnit}
                        </Badge>
                        {order.status === "IN_PROGRESS" && (
                          <DeleteScrapButton
                            scrapId={scrap.id}
                            orderId={order.id}
                            productName={scrap.productVariant.name}
                          />
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />{" "}
              Kontrol Kualitas
            </h3>
            {(order.status === "IN_PROGRESS" ||
              order.status === "COMPLETED") && <RecordQCDialog order={order} />}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Riwayat Inspeksi
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {order.inspections.map((insp) => (
                <div
                  key={insp.id}
                  className="p-3 border rounded-lg flex items-start justify-between bg-zinc-50/50 dark:bg-zinc-800/50"
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge
                        className={cn(
                          insp.result === "PASS"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
                            : insp.result === "FAIL"
                              ? "bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400"
                              : "bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400",
                        )}
                      >
                        {insp.result}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(insp.inspectedAt), "d MMM, HH:mm", { locale: idLocale })}
                      </span>
                    </div>
                    <p className="text-xs text-foreground line-clamp-2">
                      {insp.notes || "Tanpa catatan."}
                    </p>
                  </div>
                  <div className="text-[10px] text-muted-foreground whitespace-nowrap ml-2">
                    {insp.inspector?.name?.split(" ")[0] || "Sistem"}
                  </div>
                </div>
              ))}
              {order.inspections.length === 0 && (
                <p className="text-muted-foreground text-sm italic py-4">
                  Belum ada inspeksi tercatat.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
