"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, Camera, Clock, User } from "lucide-react";
import { formatWIB } from "@/lib/utils/timezone";
import { cn } from "@/lib/utils/utils";
import { PhotoGalleryDialog } from "./PhotoGalleryDialog";

interface ExecutionData {
  id: string;
  quantityProduced: number;
  scrapQuantity: number;
  startTime: string | null;
  endTime: string | null;
  notes: string | null;
  photoUrl: string | null;
  status: string;
  operator: { name: string } | null;
  machine: { code: string } | null;
  shift: { shiftName: string } | null;
}

interface GroupData {
  productionOrder: {
    id: string;
    orderNumber: string;
    bom: {
      name: string;
      productVariant: { name: string; primaryUnit: string };
    };
  };
  executions: ExecutionData[];
  totalQuantity: number;
  totalScrap: number;
}

interface ProductionHistoryClientProps {
  groups: GroupData[];
}

export function ProductionHistoryClient({ groups }: ProductionHistoryClientProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (groups.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground italic">
        Tidak ada catatan produksi historis ditemukan.
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[30px]"></TableHead>
            <TableHead>Order #</TableHead>
            <TableHead>Product</TableHead>
            <TableHead>Machine</TableHead>
            <TableHead>Operator</TableHead>
            <TableHead className="text-right">Total Yield</TableHead>
            <TableHead className="text-center">Logs</TableHead>
            <TableHead className="w-[60px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => {
            const isExpanded = expandedId === group.productionOrder.id;
            const hasPhotos = group.executions.some((e) => e.photoUrl);
            const latestExec = group.executions[0];

            return (
              <GroupRow
                key={group.productionOrder.id}
                group={group}
                isExpanded={isExpanded}
                hasPhotos={hasPhotos}
                latestExec={latestExec}
                onToggle={() =>
                  setExpandedId(isExpanded ? null : group.productionOrder.id)
                }
              />
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function GroupRow({
  group,
  isExpanded,
  hasPhotos,
  latestExec,
  onToggle,
}: {
  group: GroupData;
  isExpanded: boolean;
  hasPhotos: boolean;
  latestExec: ExecutionData;
  onToggle: () => void;
}) {
  return (
    <>
      {/* Main Row */}
      <TableRow
        className="cursor-pointer hover:bg-muted/50"
        onClick={onToggle}
      >
        <TableCell>
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform",
              isExpanded && "rotate-180"
            )}
          />
        </TableCell>
        <TableCell className="font-mono text-xs font-bold">
          {group.productionOrder.orderNumber}
        </TableCell>
        <TableCell>
          <div className="text-sm font-medium">
            {group.productionOrder.bom.productVariant.name}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {group.productionOrder.bom.name}
          </div>
        </TableCell>
        <TableCell>
          <Badge
            variant="outline"
            className="text-[10px] bg-zinc-50 dark:bg-zinc-900/50 dark:border-zinc-800"
          >
            {latestExec?.machine?.code || "N/A"}
          </Badge>
        </TableCell>
        <TableCell className="text-xs">
          {latestExec?.operator?.name || "-"}
        </TableCell>
        <TableCell className="text-right">
          <span className="font-bold text-emerald-600 dark:text-emerald-400">
            {group.totalQuantity.toLocaleString()}
          </span>
          <span className="text-[10px] ml-1 text-muted-foreground">
            {group.productionOrder.bom.productVariant.primaryUnit}
          </span>
        </TableCell>
        <TableCell className="text-center">
          <Badge variant="secondary" className="text-[10px]">
            {group.executions.length}
          </Badge>
        </TableCell>
        <TableCell>
          {hasPhotos && (
            <div onClick={(e) => e.stopPropagation()}>
              <PhotoGalleryDialog
                executions={group.executions.map((e) => ({
                  id: e.id,
                  photoUrl: e.photoUrl,
                  quantityProduced: Number(e.quantityProduced),
                  endTime: e.endTime,
                  notes: e.notes,
                }))}
                orderNumber={group.productionOrder.orderNumber}
              />
            </div>
          )}
        </TableCell>
      </TableRow>

      {/* Expanded Detail Rows */}
      {isExpanded && (
        <TableRow>
          <TableCell colSpan={8} className="bg-muted/30 p-0">
            <div className="p-4 space-y-1">
              <div className="text-xs font-medium text-muted-foreground mb-2">
                Detail Log Output ({group.executions.length} entries)
              </div>
              {group.executions.map((exec, idx) => (
                <div
                  key={exec.id}
                  className={cn(
                    "flex items-center justify-between p-2.5 rounded-md text-sm",
                    exec.status === "VOIDED"
                      ? "bg-destructive/10 opacity-60 line-through"
                      : "bg-background"
                  )}
                >
                  <div className="flex items-center gap-4">
                    <span className="text-muted-foreground w-6 text-right text-xs">
                      #{idx + 1}
                    </span>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {exec.endTime
                        ? formatWIB(exec.endTime, "dd MMM HH:mm")
                        : "-"}
                    </div>
                    {exec.operator && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <User className="h-3 w-3" />
                        {exec.operator.name}
                      </div>
                    )}
                    {exec.machine && (
                      <Badge variant="outline" className="text-[9px]">
                        {exec.machine.code}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {exec.notes && (
                      <span className="text-xs text-muted-foreground truncate max-w-[150px]">
                        {exec.notes}
                      </span>
                    )}
                    {exec.photoUrl && (
                      <div className="flex items-center gap-1 text-emerald-600">
                        <Camera className="h-3.5 w-3.5" />
                        <span className="text-[10px]">foto</span>
                      </div>
                    )}
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 min-w-[60px] text-right">
                      {Number(exec.quantityProduced).toLocaleString()}{" "}
                      <span className="text-[10px] font-normal">
                        {group.productionOrder.bom.productVariant.primaryUnit}
                      </span>
                    </span>
                    {exec.status === "VOIDED" && (
                      <Badge variant="destructive" className="h-4 text-[8px] uppercase px-1">
                        Voided
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}