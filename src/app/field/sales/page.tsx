import { getFieldSalesMobileOverview } from '@/actions/sales/mobile-field-sales';
import {
    Plus,
    Search,
    ShoppingCart,
    Package,
    ReceiptText,
    MapPin,
    Navigation,
    Store,
} from 'lucide-react';
import Link from 'next/link';
import { auth } from '@/auth';
import { RouteTodaySection } from '@/components/field/RouteTodaySection';
import { PipelineSummaryCard } from '@/components/field/PipelineSummaryCard';
import { FollowUpTodaySection } from '@/components/field/FollowUpTodaySection';
import { VisitSyncBanner } from '@/components/sales/mobile/VisitSyncBanner';
import { formatRupiah } from '@/lib/utils/utils';
import { MobileDataFreshness, MobileReadError } from '@/components/mobile';

function SectionUnavailable({ label }: { label: string }) {
    return (
        <div
            role="status"
            className="rounded-xl border border-dashed bg-muted/30 p-4"
        >
            <p className="text-sm font-medium">{label} tidak tersedia</p>
            <p className="mt-1 text-xs text-muted-foreground">
                Data gagal dimuat dan tidak dihitung sebagai nol.
            </p>
        </div>
    );
}

export default async function FieldSalesDashboardPage() {
    const session = await auth();
    const userName =
        (session?.user as { name?: string })?.name?.split(' ')[0] ?? '';
    const queuePartition =
        session?.user?.id && session.user.tenantId
            ? { tenantId: session.user.tenantId, userId: session.user.id }
            : null;
    const response = await getFieldSalesMobileOverview();
    if (!response.success || !response.data) {
        return (
            <MobileReadError title="Ringkasan sales lapangan belum tersedia" />
        );
    }

    const overview = response.data;
    const { sections } = overview;
    const route = sections.route;
    const customers = sections.activeCustomers;
    const pipeline = sections.pipeline;
    const receivables = sections.receivables;

    return (
        <div className="p-4 space-y-4">
            <div>
                <h1 className="text-xl font-bold">
                    {overview.greeting}
                    {userName ? `, ${userName}` : ''}
                </h1>
                <p className="text-sm text-muted-foreground">
                    {overview.displayDate}
                </p>
                <MobileDataFreshness generatedAt={overview.generatedAt} />
            </div>

            {queuePartition && <VisitSyncBanner partition={queuePartition} />}

            {route.status === 'UNAVAILABLE' ? (
                <SectionUnavailable label="Rute hari ini" />
            ) : (
                <>
                    <RouteTodaySection
                        businessDate={overview.businessDate}
                        routePlan={route.data}
                        activeCustomers={
                            customers.status === 'AVAILABLE'
                                ? customers.data
                                : []
                        }
                    />
                    {customers.status === 'UNAVAILABLE' && (
                        <SectionUnavailable label="Daftar customer aktif" />
                    )}
                </>
            )}

            {sections.followUps.status === 'AVAILABLE' ? (
                <FollowUpTodaySection items={sections.followUps.data.items} />
            ) : (
                <SectionUnavailable label="Follow-up hari ini" />
            )}

            {sections.compliance.status === 'AVAILABLE' ? (
                sections.compliance.data.assigned > 0 && (
                    <div className="border rounded-xl p-3 bg-card">
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                                Compliance Hari Ini
                            </span>
                            <span className="text-xs font-bold">
                                {sections.compliance.data.completed}/
                                {sections.compliance.data.assigned} toko
                            </span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-1.5">
                            <div
                                className="bg-primary h-1.5 rounded-full transition-all"
                                style={{
                                    width: `${sections.compliance.data.compliance}%`,
                                }}
                            />
                        </div>
                        <div className="flex justify-between mt-1">
                            <span className="text-[10px] text-muted-foreground">
                                {sections.compliance.data.compliance}% selesai
                            </span>
                            {sections.compliance.data.extraCalls > 0 && (
                                <span className="text-[10px] text-orange-600 font-semibold">
                                    +{sections.compliance.data.extraCalls} EC
                                </span>
                            )}
                        </div>
                    </div>
                )
            ) : (
                <SectionUnavailable label="Compliance hari ini" />
            )}

            {pipeline.status === 'AVAILABLE' ? (
                <PipelineSummaryCard
                    activeCount={pipeline.data.activeCount}
                    {...(pipeline.data.nominal.status === 'AVAILABLE'
                        ? {
                              pipelineAmount:
                                  pipeline.data.nominal.data.pipelineAmount,
                              openQuotationAmount:
                                  pipeline.data.nominal.data
                                      .openQuotationAmount,
                          }
                        : {})}
                    openQuotationCount={pipeline.data.openQuotationCount}
                    followUpCount={0}
                    topItems={pipeline.data.items}
                />
            ) : (
                <SectionUnavailable label="Pipeline saya" />
            )}

            <div className="grid grid-cols-2 gap-3">
                <Link
                    href="/field/sales/orders/create"
                    className="flex items-center gap-3 p-4 bg-primary text-primary-foreground rounded-xl active:scale-95 transition-transform min-h-[48px]"
                >
                    <Plus className="h-6 w-6" />
                    <div>
                        <p className="font-semibold">Order Baru</p>
                        <p className="text-xs opacity-80">Buat pesanan cepat</p>
                    </div>
                </Link>
                <Link
                    href="/field/sales/customers"
                    className="flex items-center gap-3 p-4 bg-muted rounded-xl active:scale-95 transition-transform min-h-[48px]"
                >
                    <Search className="h-6 w-6 text-muted-foreground" />
                    <div>
                        <p className="font-semibold">Cari Customer</p>
                        <p className="text-xs text-muted-foreground">
                            Lihat daftar outlet
                        </p>
                    </div>
                </Link>
            </div>

            <Link
                href="/field/sales/customers?startVisit=true"
                className="flex items-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/30 rounded-xl active:scale-[0.98] transition-transform min-h-[52px]"
            >
                <div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
                    <Navigation className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="flex-1">
                    <p className="font-semibold text-sm text-emerald-800 dark:text-emerald-300">
                        Mulai Kunjungan
                    </p>
                    <p className="text-xs text-emerald-600/80 dark:text-emerald-400/70">
                        Check-in di toko atau buat toko baru
                    </p>
                </div>
                <Store className="h-5 w-5 text-emerald-400 shrink-0" />
            </Link>

            <div className="grid grid-cols-2 gap-3">
                {receivables.status === 'AVAILABLE' ? (
                    receivables.data.href &&
                    receivables.data.nominal.status === 'AVAILABLE' ? (
                        <Link
                            href={receivables.data.href}
                            className="flex items-center gap-3 p-3 border rounded-xl text-sm active:scale-[0.98] transition-transform min-h-[48px]"
                        >
                            <ReceiptText className="h-5 w-5 text-rose-500 shrink-0" />
                            <div className="min-w-0">
                                <p className="text-[10px] text-muted-foreground">
                                    Piutang
                                    {receivables.data.overdueCount > 0
                                        ? ` (${receivables.data.overdueCount} overdue)`
                                        : ''}
                                </p>
                                <p className="font-bold text-sm text-rose-600 dark:text-rose-400 truncate">
                                    {formatRupiah(
                                        receivables.data.nominal.data
                                            .totalOutstanding,
                                    )}
                                </p>
                            </div>
                        </Link>
                    ) : (
                        <div className="flex items-center gap-3 p-3 border rounded-xl text-sm min-h-[48px]">
                            <ReceiptText className="h-5 w-5 text-rose-500 shrink-0" />
                            <div className="min-w-0">
                                <p className="text-[10px] text-muted-foreground">
                                    Piutang aktif
                                </p>
                                <p className="font-bold text-sm">
                                    {receivables.data.total}
                                </p>
                            </div>
                        </div>
                    )
                ) : (
                    <SectionUnavailable label="Piutang" />
                )}
                {pipeline.status === 'AVAILABLE' ? (
                    <div className="flex items-center gap-3 p-3 border rounded-xl min-h-[48px]">
                        <ShoppingCart className="h-5 w-5 text-blue-500 shrink-0" />
                        <div className="min-w-0">
                            <p className="text-[10px] text-muted-foreground">
                                Order Aktif
                            </p>
                            <p className="font-bold text-sm">
                                {pipeline.data.activeCount}
                            </p>
                        </div>
                    </div>
                ) : (
                    <SectionUnavailable label="Order aktif" />
                )}
            </div>

            <div className="space-y-2">
                <Link
                    href="/field/sales/orders"
                    className="flex items-center gap-3 p-3 border rounded-xl text-sm font-medium active:scale-[0.98] transition-transform min-h-[48px]"
                >
                    <ReceiptText className="h-4 w-4 text-muted-foreground" />
                    Lihat Semua Order
                </Link>
                <Link
                    href="/field/sales/visits"
                    className="flex items-center gap-3 p-3 border rounded-xl text-sm font-medium active:scale-[0.98] transition-transform min-h-[48px]"
                >
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    Riwayat Kunjungan
                </Link>
                <Link
                    href="/field/sales/stock"
                    className="flex items-center gap-3 p-3 border rounded-xl text-sm font-medium active:scale-[0.98] transition-transform min-h-[48px]"
                >
                    <Package className="h-4 w-4 text-muted-foreground" />
                    Cek Stok Produk
                </Link>
            </div>
        </div>
    );
}
