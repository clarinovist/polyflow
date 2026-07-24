"use client";

import { Location, Machine } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { History, Factory, Camera, Package } from "lucide-react";
import { cn, formatRupiah } from "@/lib/utils/utils";
import {
  formatProductionQuantity,
  getEnteredQuantityDisplay,
} from "@/lib/utils/production-units";
import { Progress } from "@/components/ui/progress";
import Link from "next/link";
import { ExtendedProductionOrder } from "@/components/production/order-detail/types";
import { VoidExecutionButton } from "@/components/production/VoidExecutionButton";

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b pb-2 last:border-0 last:pb-0 gap-3">
      <span className="text-muted-foreground text-sm shrink-0">{label}</span>
      <span className="font-medium text-sm text-right min-w-0 break-words">{value}</span>
    </div>
  );
}

interface OrderOverviewTabProps {
  order: ExtendedProductionOrder;
  formData?: {
    machines: Machine[];
    locations: Location[];
  };
}

export function OrderOverviewTab({ order, formData: _formData }: OrderOverviewTabProps) {
  const plannedQty = Number(order.plannedQuantity);
  const actualQty = Number(order.actualQuantity || 0);
  const progress = Math.min((actualQty / plannedQty) * 100, 100);
  const outputUnitConfig = order.bom.productVariant;
  const demandSourceLabel = order.salesOrder
    ? order.salesOrder.customer?.name || "Permintaan Customer"
    : order.isMaklon
      ? order.maklonCustomer?.name || "Permintaan Maklon"
      : "Stok Internal";

  return (
    <div className="space-y-6">
      {/* Progress Section */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Progres Produksi
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xl font-bold">
              {formatProductionQuantity(actualQty, outputUnitConfig)}
              <span className="mx-2 text-muted-foreground">/</span>
              {getEnteredQuantityDisplay({
                ...outputUnitConfig,
                quantity: plannedQty,
                enteredQuantity: order.plannedEnteredQuantity,
                enteredUnit: order.plannedEnteredUnit,
                conversionFactorSnapshot: order.plannedConversionFactorSnapshot,
              })}
            </span>
            <span className="text-sm font-medium text-muted-foreground">
              {progress.toFixed(1)}%
            </span>
          </div>
          <Progress value={progress} className="h-2" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Sumber Permintaan
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {order.salesOrder ? (
            <div className="flex flex-col gap-2 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800/50 dark:bg-blue-900/20">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-blue-900 dark:text-blue-300">
                    Tertaut Sales Order
                  </div>
                  <div className="text-xs text-blue-700 dark:text-blue-400">
                    {order.salesOrder.customer?.name || "Customer tidak ditugaskan"}{" "}
                    • {order.salesOrder.orderType.replace(/_/g, " ")}
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className="border-blue-200 bg-white text-blue-700 dark:border-blue-800/50 dark:bg-zinc-900 dark:text-blue-400"
                >
                  Permintaan Customer
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium">
                  {order.salesOrder.orderNumber}
                </span>
                <Link
                  href={`/sales/orders/${order.salesOrder.id}`}
                  className="text-blue-700 hover:underline dark:text-blue-400"
                >
                  Buka Sales Order
                </Link>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-lg border border-muted bg-muted/30 p-4">
              <div className="flex items-center gap-3">
                <Badge variant="secondary" className="text-xs font-normal">
                  Stok Internal
                </Badge>
                <span className="text-sm text-muted-foreground">
                  Produksi direncanakan tanpa Sales Order terkait
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6">
        {/* Column 1: Order Details */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Informasi SPK</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              <DetailRow label="Resep / BOM" value={order.bom.name} />
              <DetailRow
                label="Rencana Mulai"
                value={format(new Date(order.plannedStartDate), "d MMM yyyy", { locale: idLocale })}
              />
              <DetailRow
                label="Rencana Selesai"
                value={
                  order.plannedEndDate
                    ? format(new Date(order.plannedEndDate), "d MMM yyyy", { locale: idLocale })
                    : "-"
                }
              />
              <DetailRow label="Sumber Permintaan" value={demandSourceLabel} />
              {order.salesOrder && (
                <DetailRow
                  label="Sales Order"
                  value={order.salesOrder.orderNumber}
                />
              )}
              {order.isMaklon && (
                <>
                  <DetailRow label="Maklon" value="Ya" />
                  {order.maklonCustomer && (
                    <DetailRow
                      label="Customer Maklon"
                      value={order.maklonCustomer.name}
                    />
                  )}
                  {order.estimatedConversionCost && (
                    <DetailRow
                      label="Estimasi Biaya Konversi"
                      value={formatRupiah(
                        Number(order.estimatedConversionCost),
                      )}
                    />
                  )}
                </>
              )}
            </div>

            <div className="border-t pt-4 mt-4">
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Factory className="w-3 h-3" /> Sumber Daya
              </h4>
              <div className="space-y-4">
                <DetailRow
                  label="Mesin"
                  value={order.machine?.name || "Belum ditugaskan"}
                />
                <DetailRow
                  label="Shift Ditugaskan"
                  value={`${order.shifts?.length || 0} shift`}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Column 2: Materials Readiness */}
        <Card className="h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="w-4 h-4" /> Kesiapan Bahan
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const total = order.plannedMaterials?.length || 0;
              const ready = (order.plannedMaterials || []).filter((m) => {
                const issued = (order.materialIssues || [])
                  .filter(
                    (mi) =>
                      mi.productVariantId === m.productVariantId &&
                      mi.status !== "VOIDED",
                  )
                  .reduce((sum, mi) => sum + Number(mi.quantity), 0);
                return issued >= Number(m.quantity);
              }).length;
              const allReady = total > 0 && ready === total;

              return (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      Status Bahan
                    </span>
                    {allReady ? (
                      <Badge
                        variant="outline"
                        className="text-xs border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-900/20 dark:text-emerald-400"
                      >
                        Siap ({ready}/{total})
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-xs border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/50 dark:bg-amber-900/20 dark:text-amber-400"
                      >
                        Menunggu ({ready}/{total})
                      </Badge>
                    )}
                  </div>
                  {(order.plannedMaterials || []).slice(0, 5).map((m) => {
                    const issued = (order.materialIssues || [])
                      .filter(
                        (mi) =>
                          mi.productVariantId === m.productVariantId &&
                          mi.status !== "VOIDED",
                      )
                      .reduce((sum, mi) => sum + Number(mi.quantity), 0);
                    const req = Number(m.quantity);
                    const pct = req > 0 ? Math.min((issued / req) * 100, 100) : 0;
                    const isReady = issued >= req;

                    return (
                      <div key={m.id} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span
                            className={
                              isReady
                                ? "text-emerald-700 dark:text-emerald-400"
                                : "text-foreground"
                            }
                          >
                            {m.productVariant.name}
                          </span>
                          <span className="text-muted-foreground">
                            {isReady ? "✓" : `${issued.toFixed(0)}/${req.toFixed(0)}`}
                          </span>
                        </div>
                        <Progress value={pct} className="h-1" />
                      </div>
                    );
                  })}
                  {(order.plannedMaterials?.length || 0) > 5 && (
                    <p className="text-xs text-muted-foreground">
                      +{(order.plannedMaterials?.length || 0) - 5} bahan lainnya di tab Sumber Daya
                    </p>
                  )}
                </div>
              );
            })()}
          </CardContent>
        </Card>

        {/* Column 3-4: Production History */}
        <Card className="lg:col-span-2 h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="w-4 h-4" /> Riwayat Produksi
            </CardTitle>
          </CardHeader>
          <CardContent>
            {order.executions && order.executions.length > 0 ? (
              <div className="rounded-md border overflow-x-auto custom-scrollbar">
                <table className="w-full text-sm text-left min-w-[500px]">
                  <thead className="bg-muted/50 text-muted-foreground font-medium">
                    <tr>
                      <th className="p-3">Tanggal / Jam</th>
                      <th className="p-3">Shift</th>
                      <th className="p-3">Operator</th>
                      <th className="p-3 text-right">Output</th>
                      <th className="p-3 text-right">Scrap</th>
                      <th className="p-3 w-[40px]"></th>
                      <th className="p-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {order.executions.map((exec) => (
                      <tr
                        key={exec.id}
                        className={cn(
                          exec.status === "VOIDED" &&
                            "opacity-50 line-through bg-muted/30",
                        )}
                      >
                        <td className="p-3">
                          <div className="flex flex-col">
                            <span>
                              {format(new Date(exec.startTime), "d MMM yyyy", { locale: idLocale })}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(exec.startTime), "HH:mm")} -{" "}
                              {exec.endTime
                                ? format(new Date(exec.endTime), "HH:mm")
                                : "berjalan"}
                            </span>
                            {exec.status === "VOIDED" && (
                              <span className="text-[10px] font-bold text-destructive uppercase tracking-tighter">
                                Void
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3">{exec.shift?.shiftName || "-"}</td>
                        <td className="p-3">{exec.operator?.name || "-"}</td>
                        <td className="p-3 text-right font-medium text-emerald-600 dark:text-emerald-400">
                          {exec.status === "VOIDED"
                            ? "-"
                            : (() => {
                                const baseQty = Number(exec.quantityProduced);
                                const entQty = exec.enteredQuantity
                                  ? Number(exec.enteredQuantity)
                                  : null;
                                const entUnit =
                                  exec.enteredUnit ||
                                  order.bom.productVariant.primaryUnit;
                                const primaryUnit =
                                  order.bom.productVariant.primaryUnit;
                                if (
                                  entQty !== null &&
                                  entUnit !== primaryUnit
                                ) {
                                  return (
                                    <div className="flex flex-col items-end">
                                      <span className="font-medium">
                                        +{entQty} {entUnit}
                                      </span>
                                      <span className="text-[10px] text-muted-foreground">
                                        tercatat sebagai {baseQty} {primaryUnit}
                                      </span>
                                    </div>
                                  );
                                }
                                return (
                                  <span>
                                    +
                                    {formatProductionQuantity(
                                      baseQty,
                                      outputUnitConfig,
                                    )}
                                  </span>
                                );
                              })()}
                        </td>
                        <td className="p-3 text-right text-destructive">
                          {exec.status === "VOIDED"
                            ? "-"
                            : (() => {
                                const totalScrap =
                                  Number(exec.scrapQuantity || 0) +
                                  Number(exec.scrapDaunQty || 0) +
                                  Number(exec.scrapProngkolQty || 0);
                                return totalScrap > 0 ? totalScrap : "-";
                              })()}
                        </td>
                        <td className="p-3">
                          {(exec as unknown as { photoUrl?: string }).photoUrl && (
                            <a href={(exec as unknown as { photoUrl?: string }).photoUrl} target="_blank" rel="noopener noreferrer" title="Lihat foto">
                              <Camera className="h-4 w-4 text-emerald-600 hover:text-emerald-700" />
                            </a>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          {exec.status !== "VOIDED" && (
                            <VoidExecutionButton
                              executionId={exec.id}
                              productionOrderId={order.id}
                              orderNumber={order.orderNumber}
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-20 text-muted-foreground flex flex-col items-center justify-center">
                <History className="w-10 h-10 mb-4 opacity-10" />
                <p>Belum ada output produksi.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
