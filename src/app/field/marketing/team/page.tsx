import { getMarketingMobileOverview } from '@/actions/sales/mobile-marketing';
import {
    MobileDataFreshness,
    MobileEmptyState,
    MobileReadError,
    MobileSectionHeader,
} from '@/components/mobile';
import { requireMobilePortalPageAccess } from '@/lib/mobile/mobile-portal-page-access';
import { formatRupiah } from '@/lib/utils/utils';
import { SectionUnavailable } from '../SectionUnavailable';

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
    const team = overview.sections.team;
    const compliance = overview.sections.compliance;
    const complianceById = new Map(
        compliance.status === 'AVAILABLE'
            ? compliance.data.items.map((row) => [row.id, row])
            : [],
    );

    return (
        <div className="min-w-0 space-y-5">
            <MobileSectionHeader
                title="Kinerja Tim"
                level={1}
                className="px-0"
            />
            <MobileDataFreshness generatedAt={overview.generatedAt} />
            {team.status !== 'AVAILABLE' ? (
                <SectionUnavailable label="Kinerja dan target tim" />
            ) : (
                <>
                    <p className="text-sm text-muted-foreground">
                        Menampilkan {team.data.members.returned} dari{' '}
                        {team.data.members.total} anggota aktif. Target dan
                        realisasi adalah periode berjalan; compliance adalah
                        agregat rute hari ini.
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
                                {team.data.target.orders.actual}/
                                {team.data.target.orders.target ?? '-'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Gap {team.data.target.orders.gap ?? '-'}
                            </p>
                        </div>
                        <div className="rounded-xl border bg-card p-4">
                            <p className="text-xs text-muted-foreground">
                                Target kunjungan tim
                            </p>
                            <p className="text-lg font-bold tabular-nums">
                                {team.data.target.visits.actual}/
                                {team.data.target.visits.target ?? '-'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Gap {team.data.target.visits.gap ?? '-'}
                            </p>
                        </div>
                    </section>
                    {team.data.target.revenue && (
                        <p className="rounded-xl border bg-card p-4 text-sm">
                            Target omzet tim:{' '}
                            {formatRupiah(
                                team.data.target.revenue.actualAmount,
                            )}{' '}
                            dari{' '}
                            {formatRupiah(
                                team.data.target.revenue.targetAmount,
                            )}{' '}
                            · gap{' '}
                            {formatRupiah(team.data.target.revenue.gapAmount)}
                        </p>
                    )}
                    {team.data.members.items.length === 0 ? (
                        <MobileEmptyState
                            title="Belum ada anggota sales aktif"
                            className="rounded-xl border bg-card"
                        />
                    ) : (
                        <div className="space-y-3">
                            {team.data.members.items.map((member) => {
                                const memberCompliance = complianceById.get(
                                    member.id,
                                );
                                return (
                                    <article
                                        key={member.id}
                                        className="min-w-0 space-y-3 rounded-xl border bg-card p-4"
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <h2 className="min-w-0 truncate font-semibold">
                                                {member.name}
                                            </h2>
                                            {compliance.status ===
                                            'AVAILABLE' ? (
                                                <span className="shrink-0 text-sm font-bold tabular-nums">
                                                    {memberCompliance?.compliancePercent ??
                                                        0}
                                                    % rute
                                                </span>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">
                                                    Rute tidak tersedia
                                                </span>
                                            )}
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
                                                    {targetLabel(
                                                        member.orders.target,
                                                    )}{' '}
                                                    · gap{' '}
                                                    {member.orders.gap ?? '-'}
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
                                                    {targetLabel(
                                                        member.visits.target,
                                                    )}{' '}
                                                    · gap{' '}
                                                    {member.visits.gap ?? '-'}
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
                                                {formatRupiah(
                                                    member.revenue.gapAmount,
                                                )}
                                            </p>
                                        )}
                                        {compliance.status === 'AVAILABLE' && (
                                            <p className="text-xs text-muted-foreground">
                                                Rute:{' '}
                                                {memberCompliance?.visited ?? 0}
                                                /
                                                {memberCompliance?.assigned ??
                                                    0}{' '}
                                                dikunjungi ·{' '}
                                                {memberCompliance?.extraCalls ??
                                                    0}{' '}
                                                extra call
                                            </p>
                                        )}
                                    </article>
                                );
                            })}
                        </div>
                    )}
                </>
            )}
            {compliance.status === 'UNAVAILABLE' && (
                <SectionUnavailable label="Compliance rute" />
            )}
        </div>
    );
}
