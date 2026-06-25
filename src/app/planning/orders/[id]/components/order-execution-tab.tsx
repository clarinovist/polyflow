"use client";

import { Machine, Location, Employee, WorkShift } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Play, CheckCircle, TrendingUp as TrendingUpIcon } from "lucide-react";
import { cn } from "@/lib/utils/utils";
import { ShiftManager } from "@/components/production/ShiftManager";
import { ExtendedProductionOrder } from "@/components/production/order-detail/types";
import { RecordScrapDialog } from "@/components/production/order-detail/RecordScrapDialog";
import { DeleteScrapButton } from "@/components/production/order-detail/DeleteScrapButton";
import { RecordQCDialog } from "@/components/production/order-detail/RecordQCDialog";

interface OrderExecutionTabProps {
  order: ExtendedProductionOrder;
  formData: {
    locations: Location[];
    operators: Employee[];
    helpers: Employee[];
    workShifts: WorkShift[];
    machines: Machine[];
  };
}

export function OrderExecutionTab({ order, formData }: OrderExecutionTabProps) {
  return (
    <div className="space-y-6">
      {/* Shift Management Section */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Play className="w-4 h-4 text-blue-500 dark:text-blue-400" />{" "}
            Operational Resources
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
              Production & Scrap
            </h3>
            {order.status === "IN_PROGRESS" && (
              <RecordScrapDialog order={order} locations={formData.locations} />
            )}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Scrap Records
              </CardTitle>
            </CardHeader>
            <CardContent>
              {order.scrapRecords.length === 0 ? (
                <p className="text-muted-foreground text-sm italic py-4">
                  No scrap recorded for this order.
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
                          {scrap.reason || "No reason provided"}
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
              Quality Control
            </h3>
            {(order.status === "IN_PROGRESS" ||
              order.status === "COMPLETED") && <RecordQCDialog order={order} />}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Inspection History
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
                        {format(new Date(insp.inspectedAt), "MMM d, HH:mm")}
                      </span>
                    </div>
                    <p className="text-xs text-foreground line-clamp-2">
                      {insp.notes || "No notes."}
                    </p>
                  </div>
                  <div className="text-[10px] text-muted-foreground whitespace-nowrap ml-2">
                    {insp.inspector?.name?.split(" ")[0] || "System"}
                  </div>
                </div>
              ))}
              {order.inspections.length === 0 && (
                <p className="text-muted-foreground text-sm italic py-4">
                  No inspections recorded.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
