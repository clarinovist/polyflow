import { getMarketingMobileOverview } from '@/actions/sales/mobile-marketing';
import {
    MobileDataFreshness,
    MobileEmptyState,
    MobileReadError,
    MobileSectionHeader,
} from '@/components/mobile';
import { requireMobilePortalPageAccess } from '@/lib/mobile/mobile-portal-page-access';
import { formatRupiah } from '@/lib/utils/utils';

const reasonLabels = {
    COMMERCIAL_REVIEW: 'Review komersial tertunda',
    FOLLOW_UP_DUE: 'Follow-up jatuh tempo',
    VALIDITY_EXPIRED: 'Masa berlaku lewat',
} as const;

export default async function MarketingInsightsPage() {
    await requireMobilePortalPageAccess('marketing-supervisor');
    const response = await getMarketingMobileOverview();
    if (!response.success) {
        return <MobileReadError title="Insight marketing belum tersedia" />;
    }
    const overview = response.data;

    return (
        <div className="min-w-0 space-y-6">
            <MobileSectionHeader
                title="Insight Pipeline"
                level={1}
                className="px-0"
            />
            <MobileDataFreshness generatedAt={overview.generatedAt} />
            <div className="rounded-xl border bg-card p-4">
                <p className="text-sm text-muted-foreground">Piutang overdue</p>
                <p className="text-2xl font-bold tabular-nums">
                    {overview.highlights.overdueReceivableCount}
                </p>
                {'overdueReceivableAmount' in overview.highlights && (
                    <p className="text-sm font-medium">
                        {formatRupiah(
                            overview.highlights.overdueReceivableAmount,
                        )}
                    </p>
                )}
            </div>
            <section className="space-y-3" aria-labelledby="pipeline-heading">
                <div className="flex items-baseline justify-between gap-3">
                    <h2 id="pipeline-heading" className="font-semibold">
                        Quotation perlu perhatian
                    </h2>
                    <span className="text-xs text-muted-foreground">
                        {overview.pipelineExceptions.returned} dari{' '}
                        {overview.pipelineExceptions.total}
                    </span>
                </div>
                {overview.pipelineExceptions.items.length === 0 ? (
                    <MobileEmptyState
                        title="Tidak ada exception pipeline"
                        className="rounded-xl border bg-card"
                    />
                ) : (
                    overview.pipelineExceptions.items.map((item) => (
                        <article
                            key={item.id}
                            className="rounded-xl border bg-card p-4 [overflow-wrap:anywhere]"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <h3 className="font-semibold">
                                        {item.orderNumber}
                                    </h3>
                                    <p className="text-sm text-muted-foreground">
                                        {item.customerName} · {item.salesName}
                                    </p>
                                </div>
                                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                                    {reasonLabels[item.reason]}
                                </span>
                            </div>
                            {'amount' in item && (
                                <p className="mt-2 text-sm font-medium">
                                    {formatRupiah(item.amount)}
                                </p>
                            )}
                        </article>
                    ))
                )}
                <p className="text-xs text-muted-foreground">
                    Maksimal 10 quotation ditampilkan; total mencakup seluruh
                    exception tim.
                </p>
            </section>
        </div>
    );
}
