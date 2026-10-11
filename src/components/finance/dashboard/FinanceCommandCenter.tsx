import {
    AlertCircle,
    CalendarClock,
    FileClock,
    Receipt,
    TrendingUp,
} from 'lucide-react';
import Link from 'next/link';
import type { FinanceDashboardData } from '@/app/finance/page';
import {
    CommandQueueChip,
    CommandQueueFooter,
    CommandQueueRow,
    type CommandQueueItem,
} from '@/components/dashboard/CommandCenterPrimitives';
import { DashboardSectionState } from '@/components/dashboard/DashboardMetricPrimitives';
import type { FinanceReturnSummary } from '@/services/finance/sales-return-query-service';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatRupiah } from '@/lib/utils/utils';

type AvailableBoard = FinanceDashboardData & {
    state: 'AVAILABLE';
    period: NonNullable<FinanceDashboardData['period']>;
    permissions: NonNullable<FinanceDashboardData['permissions']>;
    health: NonNullable<FinanceDashboardData['health']>;
    drivers: NonNullable<FinanceDashboardData['drivers']>;
};

type Attention = NonNullable<AvailableBoard['attention']>;
type Links = AvailableBoard['permissions']['links'];
type PeriodSignals = NonNullable<AvailableBoard['periodSignals']>;
type Drivers = AvailableBoard['drivers'];

function queueItems(attention: Attention, links: Links): CommandQueueItem[] {
    const items: CommandQueueItem[] = [];
    for (const item of attention.arOverdue?.items ?? []) {
        items.push({
            id: 'ar-' + item.id,
            category: 'Piutang',
            title: item.invoiceNumber + ' · ' + item.customerName,
            subtitle:
                'Piutang jatuh tempo; urutan mengikuti tanggal jatuh tempo terlama.',
            value: formatRupiah(item.remaining),
            age: 'Jatuh tempo',
            tone: 'critical',
            href: links.salesInvoices
                ? links.salesInvoices + '/' + item.id
                : null,
            action: 'Tinjau piutang',
            icon: AlertCircle,
        });
    }
    for (const item of attention.apOverdue?.items ?? []) {
        items.push({
            id: 'ap-' + item.id,
            category: 'Hutang',
            title: item.invoiceNumber + ' · ' + item.supplierName,
            subtitle:
                'Hutang jatuh tempo; urutan mengikuti tanggal jatuh tempo terlama.',
            value: formatRupiah(item.remaining),
            age: 'Jatuh tempo',
            tone: 'critical',
            href: links.purchaseInvoices
                ? links.purchaseInvoices + '/' + item.id
                : null,
            action: 'Tinjau hutang',
            icon: Receipt,
        });
    }
    for (const item of attention.draftJournals?.items ?? []) {
        items.push({
            id: 'journal-' + item.id,
            category: 'Jurnal draf',
            title: item.entryNumber,
            subtitle: item.description,
            age: 'Belum diposting',
            tone: 'warning',
            href: links.journals ? links.journals + '/' + item.id : null,
            action: 'Review jurnal',
            icon: FileClock,
        });
    }
    if ((attention.openBankRecs ?? 0) > 0) {
        items.push({
            id: 'reconciliation',
            category: 'Rekonsiliasi',
            title: 'Rekonsiliasi bank terbuka',
            subtitle:
                'Agregat draf atau proses rekonsiliasi; detail mutasi tidak tersedia pada dashboard.',
            value: attention.openBankRecs + ' terbuka',
            tone: 'warning',
            href: links.reconciliation,
            action: 'Rekonsiliasi',
            icon: CalendarClock,
        });
    }
    return items.slice(0, 10);
}

export function FinanceCommandCenter({
    attention,
    links,
    periodSignals,
    drivers,
    returnSummary,
    returnReaderFailed,
}: {
    attention: Attention | null;
    links: Links;
    periodSignals: PeriodSignals | null;
    drivers: Drivers;
    returnSummary: FinanceReturnSummary | null;
    returnReaderFailed: boolean;
}) {
    const items = attention ? queueItems(attention, links) : [];
    const hasReturnWork = returnReaderFailed || (returnSummary?.count ?? 0) > 0;
    const attentionTotal =
        attention?.state === 'AVAILABLE' &&
        attention.arOverdue &&
        attention.apOverdue &&
        attention.draftJournals &&
        attention.openBankRecs != null
            ? attention.arOverdue.total +
              attention.apOverdue.total +
              attention.draftJournals.total +
              attention.openBankRecs
            : null;

    return (
        <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(22rem,0.85fr)]">
            <section
                aria-labelledby="finance-attention-heading"
                className="min-w-0"
            >
                <Card className="min-w-0 gap-0 overflow-hidden py-0 shadow-sm">
                    <div className="border-b p-4 sm:p-5">
                        <div className="flex items-start gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                                <AlertCircle className="h-4 w-4" />
                            </span>
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                    Prioritas Finance
                                </p>
                                <h2
                                    id="finance-attention-heading"
                                    className="mt-0.5 text-xl font-semibold tracking-tight"
                                >
                                    Butuh tindakan
                                </h2>
                                <p className="mt-2 text-sm text-muted-foreground">
                                    Urutan tetap per antrean: piutang, hutang,
                                    jurnal, rekonsiliasi, lalu retur. Ranking di
                                    dalam antrean mengikuti query kanonis.
                                </p>
                            </div>
                        </div>
                        {attention && (
                            <div
                                className="scrollbar-none -mx-1 mt-5 flex gap-2 overflow-x-auto px-1 pb-1"
                                aria-label="Ringkasan antrean Finance"
                            >
                                <CommandQueueChip
                                    label="Piutang"
                                    value={attention.arOverdue?.total ?? '—'}
                                    href={
                                        links.salesInvoices
                                            ? links.salesInvoices +
                                              '?overdue=true'
                                            : null
                                    }
                                />
                                <CommandQueueChip
                                    label="Hutang"
                                    value={attention.apOverdue?.total ?? '—'}
                                    href={
                                        links.purchaseInvoices
                                            ? links.purchaseInvoices +
                                              '?overdue=true'
                                            : null
                                    }
                                />
                                <CommandQueueChip
                                    label="Jurnal draf"
                                    value={
                                        attention.draftJournals?.total ?? '—'
                                    }
                                    href={
                                        links.journals
                                            ? links.journals + '?status=DRAFT'
                                            : null
                                    }
                                />
                                <CommandQueueChip
                                    label="Rekonsiliasi"
                                    value={attention.openBankRecs ?? '—'}
                                    href={links.reconciliation}
                                />
                            </div>
                        )}
                    </div>
                    {attention?.state === 'UNAVAILABLE' && (
                        <div className="p-4 sm:p-5">
                            <DashboardSectionState
                                state="UNAVAILABLE"
                                title="Sebagian antrean Finance tidak tersedia"
                                description="Data yang gagal dimuat tidak dianggap nol atau antrean kosong."
                            />
                        </div>
                    )}
                    {items.length > 0 ? (
                        <ul aria-label="Daftar prioritas Finance">
                            {items.map((item) => (
                                <CommandQueueRow key={item.id} item={item} />
                            ))}
                        </ul>
                    ) : attention?.state === 'AVAILABLE' && !hasReturnWork ? (
                        <div className="p-8 text-center text-sm text-muted-foreground">
                            Tidak ada item Finance yang butuh perhatian.
                        </div>
                    ) : attention ? null : (
                        <div className="p-4 sm:p-5">
                            <DashboardSectionState
                                state="UNAVAILABLE"
                                title="Antrean Finance tidak tersedia"
                                description="Kegagalan memuat data tidak dianggap sebagai antrean kosong."
                            />
                        </div>
                    )}
                    {returnReaderFailed ? (
                        <div className="border-t p-4 sm:p-5">
                            <DashboardSectionState
                                state="UNAVAILABLE"
                                title="Antrean retur penjualan tidak tersedia"
                                description="Kegagalan memuat data retur tidak dianggap sebagai antrean kosong."
                            />
                        </div>
                    ) : links.returns && returnSummary ? (
                        <div className="border-t p-4 sm:p-5">
                            <p className="text-sm font-semibold">
                                Retur menunggu tindak lanjut
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Kondisi terkini, bukan filter periode.{' '}
                                {returnSummary.count} dokumen ·{' '}
                                {formatRupiah(returnSummary.documentAmount)}{' '}
                                nilai dokumen, bukan kredit yang sudah
                                diposting.
                            </p>
                            <Button
                                asChild
                                variant="outline"
                                size="sm"
                                className="mt-3 min-h-11"
                            >
                                <Link href={links.returns}>Buka retur</Link>
                            </Button>
                        </div>
                    ) : null}
                    <CommandQueueFooter
                        total={attentionTotal}
                        returned={items.length}
                        href={links.journals}
                        label="Buka jurnal Finance"
                    />
                </Card>
            </section>

            <aside
                aria-labelledby="finance-drivers-heading"
                className="min-w-0 space-y-5"
            >
                {periodSignals ? (
                    <Card className="gap-0 border-l-4 border-l-emerald-500 py-0 shadow-sm">
                        <CardContent className="p-5">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                Kesiapan periode
                            </p>
                            <h2 className="mt-1 text-lg font-semibold">
                                {periodSignals.currentPeriod
                                    ? 'Periode ' +
                                      periodSignals.currentPeriod.name
                                    : 'Tidak ada periode berjalan'}
                            </h2>
                            <p className="mt-3 text-sm text-muted-foreground">
                                {periodSignals.openCount} periode terbuka ·{' '}
                                {periodSignals.reconThisMonth} rekonsiliasi
                                selesai bulan ini
                            </p>
                            {periodSignals.currentPeriod && (
                                <p className="mt-2 text-sm font-semibold tabular-nums">
                                    {periodSignals.daysToMonthEnd} hari menuju
                                    akhir periode
                                </p>
                            )}
                            {links.periods && (
                                <Button
                                    asChild
                                    variant="outline"
                                    className="mt-5 min-h-11 w-full"
                                >
                                    <Link href={links.periods}>
                                        Kelola periode
                                    </Link>
                                </Button>
                            )}
                        </CardContent>
                    </Card>
                ) : (
                    <DashboardSectionState
                        state="UNAVAILABLE"
                        title="Sinyal periode tidak tersedia"
                        description="Kegagalan memuat data periode tidak menghapus kondisi atau antrean Finance."
                    />
                )}
                <Card className="gap-0 py-0 shadow-sm">
                    <CardContent className="p-5">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            Insight ringkas
                        </p>
                        <h2
                            id="finance-drivers-heading"
                            className="mt-1 text-lg font-semibold"
                        >
                            Realisasi bulanan
                        </h2>
                        {drivers.state === 'UNAVAILABLE' ? (
                            <div className="mt-5">
                                <DashboardSectionState
                                    state="UNAVAILABLE"
                                    title="Arah utama Finance tidak tersedia"
                                    description="Kegagalan memuat data tidak dianggap sebagai riwayat kosong."
                                />
                            </div>
                        ) : drivers.state === 'NOT_CONFIGURED' ? (
                            <div className="mt-5">
                                <DashboardSectionState
                                    state="NOT_CONFIGURED"
                                    title="Riwayat belum cukup"
                                    description="Riwayat membutuhkan minimal empat bulan yang dapat dibandingkan."
                                />
                            </div>
                        ) : (
                            <div className="mt-5 space-y-5">
                                {[
                                    {
                                        title: 'Pendapatan bulanan',
                                        points: drivers.revenue,
                                    },
                                    {
                                        title: 'Laba bersih bulanan',
                                        points: drivers.netIncome,
                                    },
                                ].map((driver) => (
                                    <div key={driver.title}>
                                        <p className="flex items-center gap-2 text-sm font-semibold">
                                            <TrendingUp className="h-4 w-4" />
                                            {driver.title}
                                        </p>
                                        <ol className="mt-2 grid grid-cols-2 gap-2">
                                            {driver.points
                                                .slice(-4)
                                                .map((point) => (
                                                    <li
                                                        key={point.month}
                                                        className="rounded-md border p-2"
                                                    >
                                                        <p className="text-[10px] text-muted-foreground">
                                                            {point.month}
                                                        </p>
                                                        <p className="text-xs font-semibold tabular-nums">
                                                            {formatRupiah(
                                                                point.value,
                                                            )}
                                                        </p>
                                                    </li>
                                                ))}
                                        </ol>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </aside>
        </div>
    );
}
