'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatRupiah } from '@/lib/utils/utils';
import {
  ClipboardList,
  FileText,
  Truck,
  Package,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  Plus,
  ExternalLink,
} from 'lucide-react';
import type { PurchasingShiftBoard } from '@/actions/purchasing/purchasing-types';
import { PR_AGING_THRESHOLD_DAYS } from '@/actions/purchasing/purchasing-types';

interface PurchasingShiftBoardProps {
  data: PurchasingShiftBoard;
}

function StatCard({
  label,
  count,
  icon: Icon,
  href,
  ctaLabel,
  colorClass,
  sub,
}: {
  label: string;
  count: number | string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  ctaLabel: string;
  colorClass: string;
  sub?: string;
}) {
  return (
    <Link href={href} className="contents">
      <Card className="hover:border-primary/50 hover:shadow-md transition-all cursor-pointer group h-full">
        <CardContent className="p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className={`p-2 rounded-lg ${colorClass}`}>
              <Icon className="h-5 w-5" />
            </div>
            <span className="text-2xl font-bold tabular-nums">{count}</span>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
            <p className="text-xs text-primary font-semibold flex items-center gap-1 mt-1 group-hover:underline">
              {ctaLabel} <ArrowRight className="h-3 w-3" />
            </p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function AttentionSection({
  title,
  items,
  emptyMessage,
  renderItem,
}: {
  title: string;
  items: Array<Record<string, unknown>>;
  emptyMessage: string;
  renderItem: (item: Record<string, unknown>) => React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-2">{emptyMessage}</p>
      ) : (
        <div className="space-y-1">
          {items.map((item) => (
            <div
              key={String(item.id)}
              className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors min-h-[44px]"
            >
              {renderItem(item)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function PurchasingShiftBoardComponent({ data }: PurchasingShiftBoardProps) {
  const { counts, attention, performance } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Hari Ini — Pembelian</h1>
        <p className="text-muted-foreground">Antrean kerja procurement.</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard
          label="PR proses"
          count={counts.pendingPrs}
          icon={ClipboardList}
          href="/purchasing/requests"
          ctaLabel="Proses"
          colorClass="bg-blue-500/10 text-blue-600"
        />
        <StatCard
          label="DRAFT PO"
          count={counts.draftPos}
          icon={FileText}
          href="/purchasing/orders?status=DRAFT"
          ctaLabel="Buat / Kirim"
          colorClass="bg-amber-500/10 text-amber-600"
        />
        <StatCard
          label="Tunggu terima"
          count={counts.awaitingReceiptPos}
          icon={Truck}
          href="/purchasing/orders?status=SENT"
          ctaLabel="Pantau"
          colorClass="bg-emerald-500/10 text-emerald-600"
        />
        <StatCard
          label="Partial sisa"
          count={counts.partialPos}
          icon={Package}
          href="/purchasing/orders?status=PARTIAL_RECEIVED"
          ctaLabel="Lihat sisa"
          colorClass="bg-purple-500/10 text-purple-600"
        />
        <StatCard
          label="AP overdue"
          count={counts.overdueApCount}
          icon={AlertTriangle}
          href="/finance/invoices/purchase"
          ctaLabel="Ke Finance"
          colorClass="bg-red-500/10 text-red-600"
          sub={counts.overdueApAmount > 0 ? formatRupiah(counts.overdueApAmount) : undefined}
        />
      </div>

      {/* Butuh Perhatian */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <h2 className="text-sm font-bold text-foreground uppercase tracking-wide">
            Butuh Perhatian
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <AttentionSection
              title={`PR menua (≥${PR_AGING_THRESHOLD_DAYS} hari)`}
              items={attention.agingPrs.map((d) => ({
                id: d.id,
                requestNumber: d.requestNumber,
                daysOld: d.daysOld,
                status: d.status,
              }))}
              emptyMessage="Tidak ada PR menua"
              renderItem={(item) => (
                <Link
                  href={`/purchasing/requests?status=${String(item.status)}`}
                  className="flex-1 flex items-center justify-between group/link"
                >
                  <div>
                    <span className="text-sm font-mono font-bold">
                      {String(item.requestNumber)}
                    </span>
                    <Badge variant="outline" className="ml-2 text-[10px]">
                      {String(item.status)}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {Number(item.daysOld)}h
                    </span>
                    <span className="text-[10px] text-primary font-semibold hidden sm:inline">
                      Buat PO
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover/link:text-primary transition-colors" />
                  </div>
                </Link>
              )}
            />

            <AttentionSection
              title="PO DRAFT menua"
              items={attention.draftPos.map((d) => ({
                id: d.id,
                orderNumber: d.orderNumber,
                supplierName: d.supplierName,
                daysOld: d.daysOld,
              }))}
              emptyMessage="Tidak ada PO DRAFT"
              renderItem={(item) => (
                <Link
                  href={`/purchasing/orders/${String(item.id)}`}
                  className="flex-1 flex items-center justify-between group/link"
                >
                  <div>
                    <span className="text-sm font-mono font-bold">
                      {String(item.orderNumber)}
                    </span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {String(item.supplierName)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {Number(item.daysOld)}h
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover/link:text-primary transition-colors" />
                  </div>
                </Link>
              )}
            />

            <AttentionSection
              title="PO menunggu terima gudang"
              items={attention.awaitingReceipt.map((d) => ({
                id: d.id,
                orderNumber: d.orderNumber,
                supplierName: d.supplierName,
              }))}
              emptyMessage="Tidak ada PO menunggu terima"
              renderItem={(item) => (
                <Link
                  href={`/purchasing/orders/${String(item.id)}`}
                  className="flex-1 flex items-center justify-between group/link"
                >
                  <div>
                    <span className="text-sm font-mono font-bold">
                      {String(item.orderNumber)}
                    </span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {String(item.supplierName)}
                    </span>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover/link:text-primary transition-colors" />
                </Link>
              )}
            />

            <AttentionSection
              title="PO partial — sisa qty"
              items={attention.partialPos.map((d) => ({
                id: d.id,
                orderNumber: d.orderNumber,
                supplierName: d.supplierName,
              }))}
              emptyMessage="Tidak ada PO partial"
              renderItem={(item) => (
                <div className="flex-1 flex items-center justify-between gap-2">
                  <Link
                    href={`/purchasing/orders/${String(item.id)}`}
                    className="min-w-0 flex-1 group/link"
                  >
                    <span className="text-sm font-mono font-bold">
                      {String(item.orderNumber)}
                    </span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {String(item.supplierName)}
                    </span>
                  </Link>
                  <Link
                    href="/warehouse/incoming"
                    className="text-[10px] text-primary font-semibold shrink-0 hover:underline"
                  >
                    Gudang
                  </Link>
                </div>
              )}
            />

            <AttentionSection
              title="Hutang jatuh tempo"
              items={attention.overdueAp.map((d) => ({
                id: d.id,
                invoiceNumber: d.invoiceNumber,
                supplierName: d.supplierName,
                remaining: d.remaining,
              }))}
              emptyMessage="Tidak ada AP overdue"
              renderItem={(item) => (
                <Link
                  href="/finance/invoices/purchase"
                  className="flex-1 flex items-center justify-between group/link"
                >
                  <div>
                    <span className="text-sm font-mono font-bold">
                      {String(item.invoiceNumber)}
                    </span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {String(item.supplierName)}
                    </span>
                  </div>
                  <span className="text-xs font-medium text-destructive shrink-0 ml-2">
                    {formatRupiah(Number(item.remaining))}
                  </span>
                </Link>
              )}
            />

            {attention.suggestedReorder.length > 0 && (
              <AttentionSection
                title="Perlu reorder (gudang)"
                items={attention.suggestedReorder.map((d) => ({
                  id: d.id,
                  name: d.name,
                  skuCode: d.skuCode,
                  supplierName: d.supplierName,
                  totalStock: d.totalStock,
                  reorderPoint: d.reorderPoint,
                }))}
                emptyMessage=""
                renderItem={(item) => (
                  <div className="flex-1 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-sm font-medium truncate block">
                        {String(item.name)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {String(item.skuCode)}
                        {item.supplierName ? ` · ${String(item.supplierName)}` : ''}
                        {' · '}Stok: {Number(item.totalStock)} / Reorder: {item.reorderPoint != null ? Number(item.reorderPoint) : '—'}
                      </span>
                    </div>
                    <Link
                      href="/purchasing/requests"
                      className="text-[10px] text-primary font-semibold shrink-0 hover:underline flex items-center gap-0.5"
                    >
                      Buat PR <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                )}
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Cross-module notes */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Truck className="h-3.5 w-3.5" />
          <span>Terima barang di <Link href="/warehouse/incoming" className="text-primary hover:underline font-medium">Portal Gudang → Penerimaan</Link></span>
        </div>
        <div className="flex items-center gap-1.5">
          <ExternalLink className="h-3.5 w-3.5" />
          <span>Bayar hutang di <Link href="/finance/invoices/purchase" className="text-primary hover:underline font-medium">Finance → Hutang</Link></span>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        <Link href="/purchasing/requests">
          <Button size="sm">
            <Plus className="h-4 w-4 mr-1" /> PR
          </Button>
        </Link>
        <Link href="/purchasing/orders/create">
          <Button size="sm" variant="outline">
            <Plus className="h-4 w-4 mr-1" /> PO
          </Button>
        </Link>
        <Link href="/purchasing/suppliers">
          <Button size="sm" variant="outline">
            Supplier
          </Button>
        </Link>
        <Link href="/purchasing/analytics">
          <Button size="sm" variant="ghost">
            Analitik
          </Button>
        </Link>
      </div>

      {/* Ringkas Performa */}
      <Card>
        <CardContent className="p-4">
          <h2 className="text-sm font-bold text-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Ringkas Performa
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Belanja Bulan Ini</p>
              <p className="font-semibold">{formatRupiah(performance.monthlySpend)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Supplier Teratas</p>
              <p className="font-semibold">{performance.topSupplierName ?? '-'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Total di Supplier Teratas</p>
              <p className="font-semibold">
                {performance.topSupplierSpend > 0 ? formatRupiah(performance.topSupplierSpend) : '-'}
              </p>
            </div>
          </div>
          <div className="mt-3">
            <Link
              href="/purchasing/analytics"
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              Analitik lengkap <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
