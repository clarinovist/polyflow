'use client';

import Link from 'next/link';
import {
    AlertCircle,
    AlertTriangle,
    ArrowRight,
    BarChart3,
    CircleDollarSign,
    ClipboardList,
    PackageCheck,
    Plus,
    Truck,
    WalletCards,
} from 'lucide-react';
import type { PurchasingShiftBoard } from '@/actions/purchasing/purchasing-types';
import {
    DashboardFreshness,
    DashboardHealthCard,
    DashboardSectionState,
} from '@/components/dashboard/DashboardMetricPrimitives';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatRupiah } from '@/lib/utils/utils';

type QueueTone = 'critical' | 'warning' | 'neutral';

type QueueItem = {
    id: string;
    category: string;
    title: string;
    subtitle: string;
    age?: string;
    value?: string;
    tone: QueueTone;
    href?: string;
    action: string;
};

type QueueFilter = {
    label: string;
    total: number;
    href?: string;
};

const PURCHASE_REQUEST_STATUS_LABEL: Record<string, string> = {
    OPEN: 'Terbuka',
    APPROVED: 'Disetujui',
    REJECTED: 'Ditolak',
    CONVERTED: 'Sudah dibuatkan PO',
};

function purchaseRequestStatusLabel(status: unknown): string {
    const value = String(status);
    return PURCHASE_REQUEST_STATUS_LABEL[value] ?? 'Perlu ditinjau';
}

function queueDotClass(tone: QueueTone) {
    if (tone === 'critical') return 'bg-destructive ring-destructive/10';
    if (tone === 'warning') return 'bg-amber-500 ring-amber-500/10';
    return 'bg-zinc-400 ring-zinc-400/10 dark:bg-zinc-500';
}

function categoryClass(tone: QueueTone) {
    if (tone === 'critical') return 'bg-destructive/10 text-destructive';
    if (tone === 'warning') {
        return 'bg-amber-500/10 text-amber-700 dark:text-amber-300';
    }
    return 'bg-muted text-muted-foreground';
}

function QueueSummaryChip({ filter }: { filter: QueueFilter }) {
    const className =
        'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border bg-background px-3 text-xs font-semibold text-muted-foreground transition hover:border-foreground/25 hover:text-foreground';
    const body = (
        <>
            <span>{filter.label}</span>
            <span className="tabular-nums">{filter.total}</span>
        </>
    );

    return filter.href ? (
        <Link href={filter.href} className={className}>
            {body}
        </Link>
    ) : (
        <span className={className}>{body}</span>
    );
}

function QueueRow({ item }: { item: QueueItem }) {
    const body = (
        <>
            <div className="flex min-w-0 gap-3">
                <span
                    aria-hidden="true"
                    className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ring-4 ${queueDotClass(item.tone)}`}
                />
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge
                            variant="outline"
                            className={`h-6 rounded-full border-0 px-2 text-[10px] uppercase tracking-wide ${categoryClass(item.tone)}`}
                        >
                            {item.category}
                        </Badge>
                        {item.age && (
                            <span className="text-[11px] font-medium text-muted-foreground">
                                {item.age}
                            </span>
                        )}
                    </div>
                    <p className="mt-2 truncate text-sm font-semibold sm:text-[15px]">
                        {item.title}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {item.subtitle}
                    </p>
                </div>
            </div>
            <p className="pl-5 text-sm font-semibold tabular-nums sm:pl-0 sm:text-right">
                {item.value ?? '—'}
            </p>
            <span className="ml-5 inline-flex min-h-11 items-center justify-start gap-1 text-xs font-semibold text-primary sm:ml-0 sm:min-w-28 sm:justify-end">
                {item.action}
                <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </span>
        </>
    );
    const className =
        'group grid min-w-0 gap-3 border-b px-4 py-4 last:border-b-0 hover:bg-muted/35 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:px-5';

    return item.href ? (
        <li>
            <Link href={item.href} className={className}>
                {body}
            </Link>
        </li>
    ) : (
        <li className={className}>{body}</li>
    );
}

function buildQueue(
    data: PurchasingShiftBoard,
    nominalAvailable: boolean,
): QueueItem[] {
    const items: QueueItem[] = [];

    if (nominalAvailable) {
        for (const item of data.attention.overdueAp) {
            items.push({
                id: `overdue-${item.id}`,
                category: 'Hutang',
                title: `${item.invoiceNumber} · ${item.supplierName}`,
                subtitle:
                    'Tagihan melewati jatuh tempo dan perlu ditindaklanjuti.',
                value: formatRupiah(item.remaining),
                tone: 'critical',
                href: `/purchasing/invoices?overdue=true&search=${encodeURIComponent(item.invoiceNumber)}`,
                action: 'Tinjau invoice',
            });
        }
    }

    for (const item of data.attention.agingPrs) {
        items.push({
            id: `pr-${item.id}`,
            category: 'PR menua',
            title: item.requestNumber,
            subtitle: `${purchaseRequestStatusLabel(item.status)} · belum selesai diproses`,
            age: `${item.daysOld} hari`,
            tone: 'critical',
            href: `/purchasing/requests?status=${item.status}`,
            action: item.status === 'APPROVED' ? 'Buat PO' : 'Tinjau PR',
        });
    }

    for (const item of data.attention.partialPos) {
        items.push({
            id: `partial-${item.id}`,
            category: 'PO parsial',
            title: `${item.orderNumber} · ${item.supplierName}`,
            subtitle:
                'Sebagian barang sudah diterima; masih ada sisa penerimaan.',
            tone: 'warning',
            href: `/purchasing/orders/${item.id}`,
            action: 'Pantau terima',
        });
    }

    for (const item of data.attention.awaitingReceipt) {
        items.push({
            id: `receipt-${item.id}`,
            category: 'Menunggu terima',
            title: `${item.orderNumber} · ${item.supplierName}`,
            subtitle: 'Pesanan sudah dikirim dan menunggu penerimaan gudang.',
            tone: 'warning',
            href: `/purchasing/orders/${item.id}`,
            action: 'Buka PO',
        });
    }

    for (const item of data.attention.draftPos) {
        items.push({
            id: `draft-${item.id}`,
            category: 'PO draf',
            title: `${item.orderNumber} · ${item.supplierName}`,
            subtitle: 'Pesanan pembelian draf belum diselesaikan.',
            age: `${item.daysOld} hari`,
            tone: 'neutral',
            href: `/purchasing/orders/${item.id}`,
            action: 'Lanjutkan',
        });
    }

    for (const item of data.attention.suggestedReorder) {
        items.push({
            id: `reorder-${item.id}`,
            category: 'Reorder',
            title: `${item.name} · ${item.skuCode}`,
            subtitle: item.supplierName
                ? `Pemasok pilihan: ${item.supplierName}`
                : 'Belum memiliki pemasok pilihan.',
            value: `${item.totalStock.toLocaleString('id-ID')} / ${item.reorderPoint?.toLocaleString('id-ID') ?? '—'}`,
            tone: 'neutral',
            href: '/purchasing/requests',
            action: 'Buat PR',
        });
    }

    return items;
}

function queueFilters(data: PurchasingShiftBoard): QueueFilter[] {
    return [
        {
            label: 'Hutang',
            total: data.counts.overdueApCount,
            href: '/purchasing/invoices?overdue=true',
        },
        {
            label: 'PR menua',
            total: data.attention.agingPrs.length,
            href: '/purchasing/requests',
        },
        {
            label: 'PO parsial',
            total: data.counts.partialPos,
            href: '/purchasing/orders?status=PARTIAL_RECEIVED',
        },
        {
            label: 'Menunggu terima',
            total: data.counts.awaitingReceiptPos,
            href: '/purchasing/orders?status=SENT',
        },
        {
            label: 'PO draf',
            total: data.counts.draftPos,
            href: '/purchasing/orders?status=DRAFT',
        },
        {
            label: 'Reorder',
            total: data.counts.suggestedReorderCount,
            href: '/purchasing/requests',
        },
    ];
}

function PurchasingInsight({
    data,
    priorMonthComparison,
}: {
    data: PurchasingShiftBoard;
    priorMonthComparison: string;
}) {
    const nominalAvailable = data.nominalAccess === 'AVAILABLE';

    return (
        <aside
            aria-labelledby="purchasing-drivers-heading"
            className="min-w-0 space-y-5"
        >
            <Card className="min-w-0 gap-0 overflow-hidden py-0 shadow-sm">
                <CardHeader className="p-5 pb-0">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                Insight ringkas
                            </p>
                            <CardTitle
                                id="purchasing-drivers-heading"
                                className="mt-1 text-lg font-semibold"
                            >
                                Penggerak belanja
                            </CardTitle>
                        </div>
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                            <BarChart3 aria-hidden="true" className="h-4 w-4" />
                        </span>
                    </div>
                </CardHeader>
                <CardContent className="p-5 pt-0">
                    {nominalAvailable ? (
                        <>
                            <p className="mt-5 text-sm font-medium text-muted-foreground">
                                Komitmen PO bulan ini
                            </p>
                            <p className="mt-1 break-words text-2xl font-bold tracking-tight tabular-nums">
                                {data.performance.monthlySpend === undefined
                                    ? '—'
                                    : formatRupiah(
                                          data.performance.monthlySpend,
                                      )}
                            </p>
                            <Badge
                                variant="secondary"
                                className="mt-3 h-auto max-w-full whitespace-normal rounded-full text-left"
                            >
                                {priorMonthComparison}
                            </Badge>
                            <p className="mt-4 text-xs leading-5 text-muted-foreground">
                                Bulan berjalan dibanding bulan penuh sebelumnya;
                                bukan jumlah hari yang setara.
                            </p>
                        </>
                    ) : (
                        <div className="mt-5">
                            <DashboardSectionState
                                state="UNAVAILABLE"
                                title="Penggerak nominal dibatasi"
                                description="Belanja dan perbandingan periode memerlukan izin lihat harga."
                            />
                        </div>
                    )}
                    <Button
                        asChild
                        variant="outline"
                        className="mt-5 min-h-11 w-full justify-between"
                    >
                        <Link href="/purchasing/analytics">
                            Analitik lengkap
                            <ArrowRight
                                aria-hidden="true"
                                className="h-4 w-4"
                            />
                        </Link>
                    </Button>
                </CardContent>
            </Card>

            <Card className="min-w-0 gap-0 overflow-hidden py-0 shadow-sm">
                <CardContent className="p-5">
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            Sinyal utama
                        </p>
                        <AlertTriangle
                            aria-hidden="true"
                            className="h-4 w-4 text-amber-600 dark:text-amber-300"
                        />
                    </div>
                    {nominalAvailable ? (
                        <>
                            <p className="mt-4 text-sm font-medium text-muted-foreground">
                                Pemasok dengan belanja tertinggi
                            </p>
                            <p className="mt-1 break-words text-xl font-bold tracking-tight">
                                {data.performance.topSupplierName ?? '—'}
                            </p>
                            <p className="mt-2 text-sm font-semibold tabular-nums">
                                {data.performance.topSupplierSpend == null
                                    ? 'Belum ada belanja'
                                    : formatRupiah(
                                          data.performance.topSupplierSpend,
                                      )}
                            </p>
                        </>
                    ) : (
                        <p className="mt-4 text-sm leading-6 text-muted-foreground">
                            Ranking pemasok disembunyikan karena memerlukan
                            akses nominal.
                        </p>
                    )}
                    <Button
                        asChild
                        variant="outline"
                        className="mt-5 min-h-11 w-full justify-between"
                    >
                        <Link href="/purchasing/suppliers">
                            Buka pemasok
                            <ArrowRight
                                aria-hidden="true"
                                className="h-4 w-4"
                            />
                        </Link>
                    </Button>
                </CardContent>
            </Card>
        </aside>
    );
}

interface PurchasingShiftBoardProps {
    data: PurchasingShiftBoard | null;
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
                        Prioritas pengadaan dan kondisi pembelian.
                    </p>
                </div>
                <section
                    className="space-y-3"
                    aria-labelledby="purchasing-health-heading"
                >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Kondisi
                    </p>
                    <h2
                        id="purchasing-health-heading"
                        className="text-lg font-semibold"
                    >
                        Ringkasan kesehatan
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

    const { counts, performance, generatedAt } = data;
    const nominalAvailable = data.nominalAccess === 'AVAILABLE';
    const priorMonthComparison =
        performance.previousFullMonthChangePercent === null
            ? 'Tidak dapat dibandingkan: belanja bulan penuh sebelumnya nol.'
            : performance.previousFullMonthChangePercent === undefined
              ? 'Perbandingan bulan sebelumnya tidak tersedia.'
              : `${performance.previousFullMonthChangePercent >= 0 ? '+' : ''}${performance.previousFullMonthChangePercent.toLocaleString(
                    'id-ID',
                    { maximumFractionDigits: 1 },
                )}% vs bulan penuh sebelumnya`;
    const queue = buildQueue(data, nominalAvailable);
    const visibleQueue = queue.slice(0, 8);
    const filters = queueFilters(data);
    const totalQueue = filters.reduce((sum, filter) => sum + filter.total, 0);

    return (
        <div className="mx-auto flex max-w-[1600px] min-w-0 flex-col space-y-6 md:space-y-8">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        Command center
                    </p>
                    <h1 className="mt-2 text-3xl font-bold tracking-tight">
                        Pembelian
                    </h1>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                        Exception pengadaan, komitmen belanja, dan risiko
                        pemasok yang perlu ditindaklanjuti.
                    </p>
                    <div className="mt-4">
                        <DashboardFreshness generatedAt={generatedAt} />
                    </div>
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                    <Button
                        asChild
                        size="lg"
                        className="min-h-11 gap-2 shadow-sm"
                    >
                        <Link href="/purchasing/requests">
                            <Plus className="h-4 w-4" /> Buat PR
                        </Link>
                    </Button>
                    <Button
                        asChild
                        size="lg"
                        variant="outline"
                        className="min-h-11 gap-2"
                    >
                        <Link href="/purchasing/orders/create">
                            <Plus className="h-4 w-4" /> Buat PO
                        </Link>
                    </Button>
                    <Button
                        asChild
                        size="lg"
                        variant="ghost"
                        className="min-h-11 gap-2"
                    >
                        <Link href="/purchasing/analytics">
                            <BarChart3 className="h-4 w-4" /> Analitik
                        </Link>
                    </Button>
                </div>
            </div>

            <section
                className="min-w-0 space-y-3"
                aria-labelledby="purchasing-health-heading"
            >
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Kondisi
                    </p>
                    <h2
                        id="purchasing-health-heading"
                        className="text-lg font-semibold"
                    >
                        Ringkasan kesehatan
                    </h2>
                </div>
                <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <DashboardHealthCard
                        title="PR dalam proses"
                        value={counts.pendingPrs.toLocaleString('id-ID')}
                        icon={ClipboardList}
                        definition={{
                            unit: 'Permintaan pembelian',
                            period: 'Saat dashboard diperbarui',
                            description:
                                'Permintaan pembelian terbuka atau sudah disetujui yang belum selesai diproses.',
                            source: 'Data pembelian',
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
                            unit: 'Pesanan pembelian',
                            period: 'Saat dashboard diperbarui',
                            description:
                                'Pesanan yang sudah dikirim atau diterima sebagian dan masih menunggu barang.',
                            source: 'Data pembelian',
                        }}
                        href={
                            counts.awaitingReceiptPos + counts.partialPos > 0
                                ? '/purchasing/orders?status=SENT,PARTIAL_RECEIVED'
                                : undefined
                        }
                        supportingText={`${counts.partialPos} diterima sebagian`}
                    />
                    <DashboardHealthCard
                        title="Hutang jatuh tempo"
                        value={
                            nominalAvailable
                                ? formatRupiah(counts.overdueApAmount ?? 0)
                                : `${counts.overdueApCount.toLocaleString('id-ID')} tagihan`
                        }
                        icon={WalletCards}
                        definition={{
                            unit: nominalAvailable ? 'Rupiah' : 'Tagihan',
                            period: 'Jatuh tempo sebelum hari bisnis ini',
                            description:
                                'Tagihan dengan sisa hutang positif yang belum lunas atau sudah jatuh tempo.',
                            source: 'Data keuangan',
                        }}
                        href={
                            counts.overdueApCount > 0
                                ? '/purchasing/invoices?overdue=true'
                                : undefined
                        }
                        supportingText={
                            nominalAvailable
                                ? `${counts.overdueApCount} tagihan perlu ditindaklanjuti`
                                : 'Nominal dibatasi; jumlah tagihan operasional tetap tersedia.'
                        }
                    />
                    <DashboardHealthCard
                        title="Belanja bulan ini"
                        value={
                            counts.monthlySpend == null
                                ? undefined
                                : formatRupiah(counts.monthlySpend)
                        }
                        icon={CircleDollarSign}
                        definition={{
                            unit: 'Rupiah',
                            period: 'Bulan berjalan (WIB)',
                            description:
                                'Total komitmen pesanan pembelian bulan berjalan, selain pesanan draf dan dibatalkan.',
                            source: 'Data pembelian',
                        }}
                        state={nominalAvailable ? 'AVAILABLE' : 'UNAVAILABLE'}
                        supportingText={
                            nominalAvailable ? priorMonthComparison : undefined
                        }
                    />
                </div>
            </section>

            <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(22rem,0.85fr)]">
                <section
                    aria-labelledby="purchasing-attention-heading"
                    className="min-w-0"
                >
                    <Card className="min-w-0 gap-0 overflow-hidden py-0 shadow-sm">
                        <div className="border-b p-4 sm:p-5">
                            <div className="flex items-start gap-3">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                                    <AlertCircle
                                        aria-hidden="true"
                                        className="h-4 w-4"
                                    />
                                </span>
                                <div className="min-w-0">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                        Prioritas hari ini
                                    </p>
                                    <h2
                                        id="purchasing-attention-heading"
                                        className="mt-0.5 text-xl font-semibold tracking-tight"
                                    >
                                        Butuh tindakan
                                    </h2>
                                    <p className="mt-2 text-sm text-muted-foreground">
                                        Diurutkan berdasarkan dampak, usia, dan
                                        hambatan ke proses berikutnya.
                                    </p>
                                </div>
                            </div>
                            <div
                                className="scrollbar-none -mx-1 mt-5 flex gap-2 overflow-x-auto px-1 pb-1"
                                aria-label="Ringkasan antrean Pembelian"
                            >
                                {filters.map((filter) => (
                                    <QueueSummaryChip
                                        key={filter.label}
                                        filter={filter}
                                    />
                                ))}
                            </div>
                        </div>

                        {!nominalAvailable && counts.overdueApCount > 0 && (
                            <div className="border-b p-4 sm:p-5">
                                <DashboardSectionState
                                    state="UNAVAILABLE"
                                    title="Nominal dibatasi"
                                    description={`${counts.overdueApCount} tagihan jatuh tempo terdeteksi. Detail dan nominal memerlukan izin lihat harga.`}
                                />
                            </div>
                        )}

                        {visibleQueue.length > 0 ? (
                            <ul aria-label="Daftar prioritas Pembelian">
                                {visibleQueue.map((item) => (
                                    <QueueRow key={item.id} item={item} />
                                ))}
                            </ul>
                        ) : (
                            <div className="p-8 text-center">
                                <PackageCheck
                                    aria-hidden="true"
                                    className="mx-auto h-6 w-6 text-muted-foreground"
                                />
                                <p className="mt-3 font-medium">
                                    Tidak ada item yang butuh perhatian
                                </p>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Antrean pengadaan saat ini sedang kosong.
                                </p>
                            </div>
                        )}

                        <div className="flex flex-col gap-3 border-t bg-muted/20 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                            <p className="text-xs text-muted-foreground">
                                {totalQueue > visibleQueue.length
                                    ? `${totalQueue} total · ${visibleQueue.length} ditampilkan`
                                    : `${visibleQueue.length} prioritas ditampilkan`}
                            </p>
                            <Button
                                asChild
                                variant="ghost"
                                size="sm"
                                className="min-h-11 justify-start gap-1 px-0 sm:justify-center sm:px-3"
                            >
                                <Link href="/purchasing/orders">
                                    Buka daftar PO
                                    <ArrowRight
                                        aria-hidden="true"
                                        className="h-3.5 w-3.5"
                                    />
                                </Link>
                            </Button>
                        </div>
                    </Card>
                </section>

                <PurchasingInsight
                    data={data}
                    priorMonthComparison={priorMonthComparison}
                />
            </div>
        </div>
    );
}
