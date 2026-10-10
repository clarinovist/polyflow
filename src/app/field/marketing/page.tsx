import { getMarketingMobileOverview } from '@/actions/sales/mobile-marketing';
import {
    MobileDataFreshness,
    MobileEmptyState,
    MobileInsightCard,
    MobileReadError,
    MobileSectionHeader,
} from '@/components/mobile';
import { requireMobilePortalPageAccess } from '@/lib/mobile/mobile-portal-page-access';
import { formatRupiah } from '@/lib/utils/utils';
import { SectionUnavailable } from './SectionUnavailable';

const taskLabels = {
    PIPELINE: 'Pipeline',
    PROSPECT_REVIEW: 'Review prospek',
    VISIT_REVIEW: 'Review kunjungan',
    NO_FOLLOW_UP: 'Tanpa follow-up',
} as const;

export default async function MarketingMobilePage() {
    await requireMobilePortalPageAccess('marketing-supervisor');
    const response = await getMarketingMobileOverview();
    if (!response.success) {
        return <MobileReadError title="Ringkasan marketing belum tersedia" />;
    }
    const overview = response.data;
    const { sections } = overview;
    const pipelineCount =
        sections.pipelineExceptions.status === 'AVAILABLE'
            ? sections.pipelineExceptions.data.total
            : null;
    const reviewCount =
        sections.reviews.status === 'AVAILABLE'
            ? sections.reviews.data.total
            : null;
    const noFollowUpCount =
        sections.customersWithoutFollowUp.status === 'AVAILABLE'
            ? sections.customersWithoutFollowUp.data.total
            : null;
    const receivables = sections.receivables;
    const tasks = sections.tasks;

    return (
        <div className="min-w-0 space-y-6">
            <MobileSectionHeader
                title="Prioritas Tim Hari Ini"
                level={1}
                className="px-0"
            />
            <MobileDataFreshness generatedAt={overview.generatedAt} />
            <div className="grid grid-cols-2 gap-3">
                {pipelineCount == null ? (
                    <SectionUnavailable label="Pipeline perlu perhatian" />
                ) : (
                    <MobileInsightCard
                        insight={{
                            key: 'pipeline-exception',
                            label: 'Pipeline Perlu Perhatian',
                            value: pipelineCount,
                            severity: pipelineCount ? 'WARNING' : 'SUCCESS',
                        }}
                    />
                )}
                {reviewCount == null ? (
                    <SectionUnavailable label="Antrean review" />
                ) : (
                    <MobileInsightCard
                        insight={{
                            key: 'review-queue',
                            label: 'Menunggu Review',
                            value: reviewCount,
                            severity: reviewCount ? 'WARNING' : 'SUCCESS',
                        }}
                    />
                )}
                {noFollowUpCount == null ? (
                    <SectionUnavailable label="Customer tanpa follow-up" />
                ) : (
                    <MobileInsightCard
                        insight={{
                            key: 'missing-follow-up',
                            label: 'Tanpa Follow-up',
                            value: noFollowUpCount,
                            severity: noFollowUpCount ? 'WARNING' : 'SUCCESS',
                        }}
                    />
                )}
                {receivables.status === 'AVAILABLE' ? (
                    <MobileInsightCard
                        insight={{
                            key: 'overdue-receivables',
                            label: 'Piutang Overdue',
                            value: receivables.data.overdueCount,
                            severity: receivables.data.overdueCount
                                ? 'CRITICAL'
                                : 'SUCCESS',
                        }}
                    />
                ) : (
                    <SectionUnavailable label="Piutang overdue" />
                )}
            </div>

            {receivables.status === 'AVAILABLE' &&
                'overdueAmount' in receivables.data && (
                    <p className="rounded-xl border bg-card p-4 text-sm">
                        Total sisa piutang overdue:{' '}
                        <strong>
                            {formatRupiah(receivables.data.overdueAmount)}
                        </strong>
                    </p>
                )}

            <section
                className="space-y-3"
                aria-labelledby="marketing-task-heading"
            >
                <div className="flex items-baseline justify-between gap-3">
                    <h2 id="marketing-task-heading" className="font-semibold">
                        Antrean awal
                    </h2>
                    {tasks.status === 'AVAILABLE' && (
                        <span className="text-xs text-muted-foreground">
                            {tasks.data.returned} dari {tasks.data.total}
                        </span>
                    )}
                </div>
                {tasks.status !== 'AVAILABLE' ? (
                    <SectionUnavailable label="Antrean awal" />
                ) : tasks.data.items.length === 0 ? (
                    <MobileEmptyState
                        title="Tidak ada antrean prioritas"
                        description="Snapshot tim saat ini tidak memiliki exception yang perlu ditinjau."
                        className="rounded-xl border bg-card"
                    />
                ) : (
                    <div className="space-y-2">
                        {tasks.data.items.map((task) => (
                            <article
                                key={`${task.kind}:${task.id}`}
                                className="min-w-0 rounded-xl border bg-card p-4 [overflow-wrap:anywhere]"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-xs font-medium text-teal-700 dark:text-teal-300">
                                            {taskLabels[task.kind]}
                                        </p>
                                        <h3 className="font-semibold">
                                            {task.title}
                                        </h3>
                                        <p className="text-sm text-muted-foreground">
                                            {task.subtitle}
                                        </p>
                                    </div>
                                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                                        {task.priority}
                                    </span>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
                <p className="text-xs text-muted-foreground">
                    Maksimal 10 item ditampilkan. Total menghitung seluruh
                    exception tim pada snapshot yang sama.
                </p>
            </section>
        </div>
    );
}
