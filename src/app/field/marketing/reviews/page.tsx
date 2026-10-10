import { getMarketingMobileOverview } from '@/actions/sales/mobile-marketing';
import {
    MobileDataFreshness,
    MobileEmptyState,
    MobileReadError,
    MobileSectionHeader,
} from '@/components/mobile';
import { requireMobilePortalPageAccess } from '@/lib/mobile/mobile-portal-page-access';
import { SectionUnavailable } from '../SectionUnavailable';

export default async function MarketingReviewsPage() {
    await requireMobilePortalPageAccess('marketing-supervisor');
    const response = await getMarketingMobileOverview();
    if (!response.success) {
        return (
            <MobileReadError title="Antrean review marketing belum tersedia" />
        );
    }
    const overview = response.data;
    const reviews = overview.sections.reviews;
    const noFollowUp = overview.sections.customersWithoutFollowUp;

    return (
        <div className="min-w-0 space-y-6">
            <MobileSectionHeader
                title="Antrean Review"
                level={1}
                className="px-0"
            />
            <MobileDataFreshness generatedAt={overview.generatedAt} />
            <section
                className="space-y-3"
                aria-labelledby="pending-review-heading"
            >
                <div className="flex items-baseline justify-between gap-3">
                    <h2 id="pending-review-heading" className="font-semibold">
                        Prospek & kunjungan
                    </h2>
                    {reviews.status === 'AVAILABLE' && (
                        <span className="text-xs text-muted-foreground">
                            {reviews.data.returned} dari {reviews.data.total}
                        </span>
                    )}
                </div>
                {reviews.status !== 'AVAILABLE' ? (
                    <SectionUnavailable label="Review prospek dan kunjungan" />
                ) : reviews.data.items.length === 0 ? (
                    <MobileEmptyState
                        title="Tidak ada review tertunda"
                        className="rounded-xl border bg-card"
                    />
                ) : (
                    reviews.data.items.map((item) => (
                        <article
                            key={`${item.kind}:${item.id}`}
                            className="rounded-xl border bg-card p-4 [overflow-wrap:anywhere]"
                        >
                            <p className="text-xs font-medium text-teal-700 dark:text-teal-300">
                                {item.kind === 'PROSPECT'
                                    ? 'Prospek'
                                    : 'Kunjungan'}
                            </p>
                            <h3 className="font-semibold">{item.title}</h3>
                            <p className="text-sm text-muted-foreground">
                                Sales: {item.salesName}
                            </p>
                        </article>
                    ))
                )}
                <p className="text-xs text-muted-foreground">
                    Read-only beta: keputusan review tetap dilakukan melalui
                    desktop. Maksimal 10 item ditampilkan.
                </p>
            </section>

            <section className="space-y-3" aria-labelledby="follow-up-heading">
                <div className="flex items-baseline justify-between gap-3">
                    <h2 id="follow-up-heading" className="font-semibold">
                        Customer tanpa follow-up
                    </h2>
                    {noFollowUp.status === 'AVAILABLE' && (
                        <span className="text-xs text-muted-foreground">
                            {noFollowUp.data.returned} dari{' '}
                            {noFollowUp.data.total}
                        </span>
                    )}
                </div>
                {noFollowUp.status !== 'AVAILABLE' ? (
                    <SectionUnavailable label="Customer tanpa follow-up" />
                ) : noFollowUp.data.items.length === 0 ? (
                    <MobileEmptyState
                        title="Semua customer punya follow-up"
                        className="rounded-xl border bg-card"
                    />
                ) : (
                    noFollowUp.data.items.map((item) => (
                        <article
                            key={item.id}
                            className="rounded-xl border bg-card p-4 [overflow-wrap:anywhere]"
                        >
                            <h3 className="font-semibold">
                                {item.customerName}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                                {item.salesName}
                                {item.city ? ` · ${item.city}` : ''}
                            </p>
                        </article>
                    ))
                )}
                <p className="text-xs text-muted-foreground">
                    Daftar dibatasi 10 customer yang paling lama diperbarui;
                    tidak disimpan untuk akses offline.
                </p>
            </section>
        </div>
    );
}
