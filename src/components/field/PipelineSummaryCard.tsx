"use client";

import { Link } from "lucide-react";
import NextLink from "next/link";
import { formatRupiah } from "@/lib/utils/utils";

type PipelineItem = {
  id: string;
  orderNumber: string;
  customerName: string;
  totalAmount: number | null;
  status: string;
  orderDate: string;
};

type PipelineSummaryCardProps = {
  activeCount: number;
  pipelineAmount: number;
  openQuotationCount: number;
  openQuotationAmount: number;
  followUpCount: number;
  topItems: PipelineItem[];
};

export function PipelineSummaryCard({
  activeCount,
  pipelineAmount,
  openQuotationCount,
  openQuotationAmount,
  followUpCount,
  topItems,
}: PipelineSummaryCardProps) {
  return (
    <div className="border rounded-2xl p-4 bg-card shadow-sm space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link className="h-5 w-5 text-primary" />
          <h3 className="font-bold text-sm text-foreground">Pipeline Saya</h3>
        </div>
        <NextLink
          href="/field/sales/orders"
          className="text-[10px] font-semibold text-primary hover:underline"
        >
          Lihat semua
        </NextLink>
      </div>

      {/* Count Pills */}
      <div className="flex flex-wrap gap-2">
        {openQuotationCount > 0 && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/30 text-xs font-semibold text-blue-700 dark:text-blue-400">
            {openQuotationCount} penawaran
            {openQuotationAmount > 0 && (
              <span className="text-[10px] font-normal opacity-70">
                {formatRupiah(openQuotationAmount)}
              </span>
            )}
          </span>
        )}
        {activeCount > 0 && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/30 text-xs font-semibold text-amber-700 dark:text-amber-400">
            {activeCount} aktif
            {pipelineAmount > 0 && (
              <span className="text-[10px] font-normal opacity-70">
                {formatRupiah(pipelineAmount)}
              </span>
            )}
          </span>
        )}
        {followUpCount > 0 && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/30 text-xs font-semibold text-rose-700 dark:text-rose-400">
            {followUpCount} follow-up
          </span>
        )}
        {activeCount === 0 && openQuotationCount === 0 && followUpCount === 0 && (
          <span className="text-xs text-muted-foreground">Tidak ada order aktif atau penawaran</span>
        )}
      </div>

      {/* Top Items (max 3) */}
      {topItems.length > 0 && (
        <div className="space-y-1.5">
          {topItems.map((item) => (
            <NextLink
              key={item.id}
              href={`/field/sales/orders/${item.id}`}
              className="flex items-center justify-between p-2.5 border rounded-xl hover:bg-muted/50 active:scale-[0.98] transition-all min-h-[44px]"
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">
                  {item.customerName}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {item.orderNumber}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-semibold text-primary">
                  {item.totalAmount ? formatRupiah(item.totalAmount) : "-"}
                </p>
                <p className="text-[10px] text-muted-foreground">{item.status}</p>
              </div>
            </NextLink>
          ))}
        </div>
      )}
    </div>
  );
}
