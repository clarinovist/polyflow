import { getMarketingMobileOverview } from '@/actions/sales/mobile-marketing';
import {
    MobileDataFreshness,
    MobileEmptyState,
    MobileReadError,
    MobileSectionHeader,
} from '@/components/mobile';
import { requireMobilePortalPageAccess } from '@/lib/mobile/mobile-portal-page-access';
import { formatRupiah } from '@/lib/utils/utils';

function targetLabel(target: number | null): string {
    return target == null ? 'Target belum ditetapkan' : `Target ${target}`;
}

export default async function MarketingTeamPage() {
    await requireMobilePortalPageAccess('marketing-supervisor');
    const response = await getMarketingMobileOverview();
    if (!response.success) {
        return <MobileReadError title="Ringkasan tim sales belum tersedia" />;
    }
    const overview = response.data;
    const complianceById = new Map(
        overview.compliance.items.map((row) => [row.id, row]),
    );

    return (
        <div className="min-w-0 space-y-5">
            <MobileSectionHeader
                title="Kinerja Tim"
                level={1}
                className="px-0"
            />
            <MobileDataFreshness generatedAt={overview.generatedAt} />
            <p className="text-sm text-muted-foreground">
                Menampilkan {overview.team.returned} dari {overview.team.total}{' '}
                anggota aktif. Target dan realisasi adalah periode berjalan;
                compliance adalah agregat rute hari ini.
            </p>
            <section
                className="grid grid-cols-2 gap-3"
                aria-labelledby="team-target-heading"
            >
                <h2 id="team-target-heading" className="sr-only">
                    Target tim
                </h2>
                <div className="rounded-xl border bg-card p-4">
                    <p className="text-xs text-muted-foreground">
                        Target order tim
                    </p>
                    <p className="text-lg font-bold tabular-nums">
                        {overview.teamTarget.orders.actual}/
                        {overview.teamTarget.orders.target ?? '-'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                        Gap {overview.teamTarget.orders.gap ?? '-'}
                    </p>
                </div>
                <div className="rounded-xl border bg-card p-4">
                    <p className="text-xs text-muted-foreground">
                        Target kunjungan tim
                    </p>
                    <p className="text-lg font-bold tabular-nums">
                        {overview.teamTarget.visits.actual}/
                        {overview.teamTarget.visits.target ?? '-'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                        Gap {overview.teamTarget.visits.gap ?? '-'}
                    </p>
                </div>
            </section>
            {overview.teamTarget.revenue && (
                <p className="rounded-xl border bg-card p-4 text-sm">
                    Target omzet tim:{' '}
                    {formatRupiah(overview.teamTarget.revenue.actualAmount)}{' '}
                    dari{' '}
                    {formatRupiah(overview.teamTarget.revenue.targetAmount)} ·
                    gap {formatRupiah(overview.teamTarget.revenue.gapAmount)}
                </p>
            )}
            {overview.team.items.length === 0 ? (
                <MobileEmptyState
                    title="Belum ada anggota sales aktif"
                    className="rounded-xl border bg-card"
                />
            ) : (
                <div className="space-y-3">
                    {overview.team.items.map((member) => {
                        const compliance = complianceById.get(member.id);
                        return (
                            <article
                                key={member.id}
                                className="min-w-0 space-y-3 rounded-xl border bg-card p-4"
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <h2 className="min-w-0 truncate font-semibold">
                                        {member.name}
                                    </h2>
                                    <span className="shrink-0 text-sm font-bold tabular-nums">
                                        {compliance?.compliancePercent ?? 0}%
                                        rute
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                    <div className="rounded-lg bg-muted/60 p-3">
                                        <p className="text-xs text-muted-foreground">
                                            Order
                                        </p>
                                        <p className="font-semibold tabular-nums">
                                            {member.orders.actual}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {targetLabel(member.orders.target)}{' '}
                                            · gap {member.orders.gap ?? '-'}
                                        </p>
                                    </div>
                                    <div className="rounded-lg bg-muted/60 p-3">
                                        <p className="text-xs text-muted-foreground">
                                            Kunjungan
                                        </p>
                                        <p className="font-semibold tabular-nums">
                                            {member.visits.actual}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {targetLabel(member.visits.target)}{' '}
                                            · gap {member.visits.gap ?? '-'}
                                        </p>
                                    </div>
                                </div>
                                {member.revenue && (
                                    <p className="text-sm">
                                        Omzet{' '}
                                        {formatRupiah(
                                            member.revenue.actualAmount,
                                        )}{' '}
                                        dari{' '}
                                        {formatRupiah(
                                            member.revenue.targetAmount,
                                        )}{' '}
                                        · gap{' '}
                                        {formatRupiah(member.revenue.gapAmount)}
                                    </p>
                                )}
                                <p className="text-xs text-muted-foreground">
                                    Rute: {compliance?.visited ?? 0}/
                                    {compliance?.assigned ?? 0} dikunjungi ·{' '}
                                    {compliance?.extraCalls ?? 0} extra call
                                </p>
                            </article>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
