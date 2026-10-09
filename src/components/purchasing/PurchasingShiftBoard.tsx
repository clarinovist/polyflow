'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import {
    DashboardFreshness,
    DashboardHealthCard,
    DashboardSectionState,
} from '@/components/dashboard/DashboardMetricPrimitives';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatRupiah } from '@/lib/utils/utils';
import {
    ClipboardList,
    Truck,
    AlertTriangle,
    ArrowRight,
    Plus,
    ShoppingCart,
} from 'lucide-react';
import type { PurchasingShiftBoard } from '@/actions/purchasing/purchasing-types';
import { PR_AGING_THRESHOLD_DAYS } from '@/actions/purchasing/purchasing-types';

interface PurchasingShiftBoardProps {
    data: PurchasingShiftBoard | null;
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
                <p className="text-xs text-muted-foreground italic py-2">
                    {emptyMessage}
                </p>
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

export function PurchasingShiftBoardComponent({
    data,
}: PurchasingShiftBoardProps) {
    if (!data) {
        return (
            <div className="min-w-0 space-y-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        Pembelian
                    </h1>
                    <p className="text-muted-foreground">
                        Kondisi, perhatian, dan driver pengadaan.
                    </p>
                </div>
                <section
                    className="space-y-3"
                    aria-labelledby="purchasing-health-heading"
                >
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Health
                    </p>
                    <h2
                        id="purchasing-health-heading"
                        className="text-lg font-semibold"
                    >
                        Kondisi utama
                    </h2>
                    <DashboardSectionState
                        state="UNAVAILABLE"
                        title="Dashboard pembelian tidak tersedia"
                        description="Data gagal dimuat. Angka kosong tidak dianggap nol."
                    />
                </section>
            </div>
        );
    }

    const { counts, attention, performance, generatedAt } = data;

    return (
        <div className="min-w-0 space-y-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <h1 className="text-3xl font-bold tracking-tight">
                        Pembelian
                    </h1>
                    <p className="text-muted-foreground">
                        Kondisi, perhatian, dan driver pengadaan.
                    </p>
                </div>
                <DashboardFreshness generatedAt={generatedAt} />
            </div>

            <section
                className="min-w-0 space-y-3"
                aria-labelledby="purchasing-health-heading"
            >
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Health
                    </p>
                    <h2
                        id="purchasing-health-heading"
                        className="text-lg font-semibold"
                    >
                        Kondisi utama
                    </h2>
                </div>
                <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <DashboardHealthCard
                        title="PR dalam proses"
                        value={counts.pendingPrs.toLocaleString('id-ID')}
                        icon={ClipboardList}
                        definition={{
                            unit: 'Purchase request',
                            period: 'Saat dashboard diperbarui',
                            description:
                                'PR OPEN atau APPROVED yang belum selesai diproses.',
                            source: 'Purchasing',
                        }}
                        href={
                            counts.pendingPrs > 0
                                ? '/purchasing/requests'
                                : undefined
                        }
                        supportingText={
                            counts.pendingPrs > 0
                                ? 'Perlu diproses'
                                : 'Antrean kosong'
                        }
                    />
                    <DashboardHealthCard
                        title="PO menunggu penerimaan"
                        value={(
                            counts.awaitingReceiptPos + counts.partialPos
                        ).toLocaleString('id-ID')}
                        icon={Truck}
                        definition={{
                            unit: 'Purchase order',
                            period: 'Saat dashboard diperbarui',
                            description:
                                'PO SENT atau PARTIAL_RECEIVED yang masih menunggu barang.',
                            source: 'Purchasing',
                        }}
                        href={
                            counts.awaitingReceiptPos + counts.partialPos > 0
                                ? '/purchasing/orders?status=SENT,PARTIAL_RECEIVED'
                                : undefined
                        }
                        supportingText={
                            counts.partialPos + ' diterima sebagian'
                        }
                    />
                    <DashboardHealthCard
                        title="Hutang overdue"
                        value={formatRupiah(counts.overdueApAmount)}
                        icon={AlertTriangle}
                        definition={{
                            unit: 'IDR',
                            period: 'Jatuh tempo sebelum hari bisnis ini',
                            description:
                                'Sisa hutang positif dengan status UNPAID, PARTIAL, atau OVERDUE.',
                            source: 'Finance',
                        }}
                        href={
                            counts.overdueApCount > 0
                                ? '/purchasing/invoices?overdue=true'
                                : undefined
                        }
                        supportingText={
                            counts.overdueApCount +
                            ' invoice perlu ditindaklanjuti'
                        }
                    />
                    <DashboardHealthCard
                        title="Belanja bulan ini"
                        value={formatRupiah(counts.monthlySpend)}
                        icon={ShoppingCart}
                        definition={{
                            unit: 'IDR',
                            period: 'Bulan berjalan (MTD)',
                            description:
                                'Total PO non-draf dan non-batal yang dibuat bulan ini.',
                            source: 'Purchasing',
                        }}
                        supportingText="Target/budget belum dikonfigurasi"
                    />
                </div>
            </section>

            <section
                className="min-w-0 space-y-3"
                aria-labelledby="purchasing-attention-heading"
            >
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Attention
                    </p>
                    <h2
                        id="purchasing-attention-heading"
                        className="text-lg font-semibold"
                    >
                        Butuh perhatian
                    </h2>
                </div>

                {/* Butuh Perhatian */}
                <Card>
                    <CardContent className="p-4 space-y-4">
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
                                            <Badge
                                                variant="outline"
                                                className="ml-2 text-[10px]"
                                            >
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
                                title="PO draf menua"
                                items={attention.draftPos.map((d) => ({
                                    id: d.id,
                                    orderNumber: d.orderNumber,
                                    supplierName: d.supplierName,
                                    daysOld: d.daysOld,
                                }))}
                                emptyMessage="Tidak ada PO draf"
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
                                title="PO diterima sebagian — sisa kuantitas"
                                items={attention.partialPos.map((d) => ({
                                    id: d.id,
                                    orderNumber: d.orderNumber,
                                    supplierName: d.supplierName,
                                }))}
                                emptyMessage="Tidak ada PO diterima sebagian"
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
                                emptyMessage="Tidak ada hutang jatuh tempo"
                                renderItem={(item) => (
                                    <Link
                                        href={`/purchasing/invoices?overdue=true&search=${encodeURIComponent(String(item.invoiceNumber))}`}
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
                                            {formatRupiah(
                                                Number(item.remaining),
                                            )}
                                        </span>
                                    </Link>
                                )}
                            />

                            {attention.suggestedReorder.length > 0 && (
                                <AttentionSection
                                    title="Perlu dipesan ulang (gudang)"
                                    items={attention.suggestedReorder.map(
                                        (d) => ({
                                            id: d.id,
                                            name: d.name,
                                            skuCode: d.skuCode,
                                            supplierName: d.supplierName,
                                            totalStock: d.totalStock,
                                            reorderPoint: d.reorderPoint,
                                        }),
                                    )}
                                    emptyMessage=""
                                    renderItem={(item) => (
                                        <div className="flex-1 flex items-center justify-between gap-2">
                                            <div className="min-w-0">
                                                <span className="text-sm font-medium truncate block">
                                                    {String(item.name)}
                                                </span>
                                                <span className="text-[10px] text-muted-foreground">
                                                    {String(item.skuCode)}
                                                    {item.supplierName
                                                        ? ` · ${String(item.supplierName)}`
                                                        : ''}
                                                    {' · '}Stok:{' '}
                                                    <span className="tabular-nums">
                                                        {Number(
                                                            item.totalStock,
                                                        )}
                                                    </span>{' '}
                                                    / Titik pesan ulang:{' '}
                                                    {item.reorderPoint != null
                                                        ? Number(
                                                              item.reorderPoint,
                                                          ).toLocaleString(
                                                              'id-ID',
                                                          )
                                                        : '—'}
                                                </span>
                                            </div>
                                            <Link
                                                href="/purchasing/requests"
                                                className="text-[10px] text-primary font-semibold shrink-0 hover:underline flex items-center gap-0.5"
                                            >
                                                Buat PR{' '}
                                                <ArrowRight className="h-3 w-3" />
                                            </Link>
                                        </div>
                                    )}
                                />
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Aksi frekuensi tinggi, bukan pengulangan menu portal. */}
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
                </div>
            </section>

            <section
                className="min-w-0 space-y-3"
                aria-labelledby="purchasing-drivers-heading"
            >
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Drivers
                    </p>
                    <h2
                        id="purchasing-drivers-heading"
                        className="text-lg font-semibold"
                    >
                        Penggerak belanja
                    </h2>
                </div>
                {/* Ringkas Performa */}
                <Card>
                    <CardContent className="p-4">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                            <div>
                                <p className="text-muted-foreground">
                                    Belanja bulan ini
                                </p>
                                <p className="font-semibold tabular-nums">
                                    {formatRupiah(performance.monthlySpend)}
                                </p>
                            </div>
                            <div>
                                <p className="text-muted-foreground">
                                    Pemasok teratas
                                </p>
                                <p className="font-semibold">
                                    {performance.topSupplierName ?? '-'}
                                </p>
                            </div>
                            <div>
                                <p className="text-muted-foreground">
                                    Total pada pemasok teratas
                                </p>
                                <p className="font-semibold tabular-nums">
                                    {performance.topSupplierSpend > 0
                                        ? formatRupiah(
                                              performance.topSupplierSpend,
                                          )
                                        : '-'}
                                </p>
                            </div>
                        </div>
                        <div className="mt-3">
                            <Link
                                href="/purchasing/analytics"
                                className="text-xs text-primary hover:underline flex items-center gap-1"
                            >
                                Analitik lengkap{' '}
                                <ArrowRight className="h-3 w-3" />
                            </Link>
                        </div>
                    </CardContent>
                </Card>
            </section>
        </div>
    );
}
