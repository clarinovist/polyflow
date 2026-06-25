"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils/utils";
import { updateProductionIssueStatus } from "@/actions/production/production";
import { ExtendedProductionOrder } from "@/components/production/order-detail/types";
import { AddIssueDialog } from "@/components/production/order-detail/AddIssueDialog";

interface OrderIssuesTabProps {
  order: ExtendedProductionOrder;
}

export function OrderIssuesTab({ order }: OrderIssuesTabProps) {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500 dark:text-amber-400" />
          Production Issues
        </h3>
        {(order.status === "IN_PROGRESS" || order.status === "RELEASED") && (
          <AddIssueDialog orderId={order.id} />
        )}
      </div>

      {!order.issues || order.issues.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-xl">
          <AlertTriangle className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p>No issues recorded for this order.</p>
          <p className="text-xs mt-1">
            Issues help track and resolve production problems.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {order.issues.map((issue) => (
            <Card
              key={issue.id}
              className={cn(
                "transition-colors",
                issue.status === "RESOLVED" ? "opacity-60" : "",
              )}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs",
                          issue.status === "OPEN"
                            ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800/50"
                            : issue.status === "IN_PROGRESS"
                              ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800/50"
                              : "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800/50",
                        )}
                      >
                        {issue.status}
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {issue.category.replace("_", " ")}
                      </Badge>
                    </div>
                    <p className="text-sm text-foreground">
                      {issue.description}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Reported:{" "}
                      {format(new Date(issue.reportedAt), "MMM d, yyyy HH:mm")}
                      {issue.reportedBy?.name && ` by ${issue.reportedBy.name}`}
                    </p>
                    {issue.resolvedAt && (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400">
                        Resolved:{" "}
                        {format(
                          new Date(issue.resolvedAt),
                          "MMM d, yyyy HH:mm",
                        )}
                        {issue.resolvedNotes && ` - ${issue.resolvedNotes}`}
                      </p>
                    )}
                  </div>
                  {issue.status !== "RESOLVED" &&
                    order.status === "IN_PROGRESS" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800/50 dark:hover:bg-emerald-900/20"
                        onClick={async () => {
                          const result = await updateProductionIssueStatus(
                            issue.id,
                            "RESOLVED",
                            undefined,
                            order.id,
                          );
                          if (result.success) {
                            toast.success("Isu terselesaikan");
                          } else {
                            toast.error("Gagal menyelesaikan isu");
                          }
                        }}
                      >
                        Resolve
                      </Button>
                    )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
