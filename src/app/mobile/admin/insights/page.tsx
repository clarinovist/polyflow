import { getAdminMobileOverview } from '@/actions/dashboard/mobile-admin';
import {
    MobileDataFreshness,
    MobileInsightCard,
    MobileReadError,
    MobileSectionHeader,
} from '@/components/mobile';

export default async function AdminInsightsPage() {
    const response = await getAdminMobileOverview();
    if (!response.success) {
        return <MobileReadError title="Insight admin belum tersedia" />;
    }
    const overview = response.data;

    return (
        <div className="space-y-5">
            <MobileSectionHeader title="Insight" level={1} className="px-0" />
            <MobileDataFreshness generatedAt={overview.generatedAt} />
            <section className="space-y-3">
                <h2 className="text-sm font-semibold">Status modul</h2>
                <div className="grid gap-3">
                    {overview.modules.map((module) => (
                        <article
                            key={module.key}
                            className="rounded-xl border bg-card p-4"
                        >
                            <div className="flex items-center justify-between gap-3">
                                <h3 className="font-semibold">
                                    {module.label}
                                </h3>
                                <span className="text-xs font-semibold">
                                    {module.state === 'AVAILABLE'
                                        ? 'Tersedia'
                                        : 'Tidak tersedia'}
                                </span>
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                                <p>
                                    Pengecualian
                                    <br />
                                    <strong className="text-lg tabular-nums">
                                        {module.exceptionCount ?? '—'}
                                    </strong>
                                </p>
                                <p>
                                    Menunggu persetujuan
                                    <br />
                                    <strong className="text-lg tabular-nums">
                                        {module.approvalCount ?? '—'}
                                    </strong>
                                </p>
                            </div>
                        </article>
                    ))}
                </div>
            </section>
            <section className="space-y-3">
                <h2 className="text-sm font-semibold">Sorotan agregat</h2>
                <div className="grid grid-cols-2 gap-3">
                    {overview.highlights
                        .filter((highlight) => highlight.key !== 'tasks')
                        .map((highlight) => (
                            <MobileInsightCard
                                key={highlight.key}
                                insight={highlight}
                            />
                        ))}
                </div>
            </section>
        </div>
    );
}
