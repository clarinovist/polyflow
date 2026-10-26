import { formatQuantitySummary } from '@/lib/production/quantity-summary';
import { kioskLabels } from '@/lib/labels';
import type { OperatorTodaySummary } from '@/actions/production/production-execution';

interface KioskTodayStripProps {
    operatorName: string;
    summary: OperatorTodaySummary | null;
    isLoading?: boolean;
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="grid gap-1 rounded-xl bg-muted/60 p-3">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="text-xl font-bold tabular-nums">{value}</dd>
        </div>
    );
}

/** Today's figures for the operator, each with the unit it was recorded in. */
export function KioskTodayStrip({
    operatorName,
    summary,
    isLoading,
}: KioskTodayStripProps) {
    const hasOutput =
        summary &&
        (summary.jobCount > 0 ||
            summary.goodByUnit.some((row) => row.quantity > 0) ||
            summary.scrapKg > 0 ||
            summary.scrapUnverifiedEntries > 0 ||
            summary.activeJobsCount > 0);

    return (
        <section className="grid gap-3 rounded-2xl border-2 border-border bg-card p-4">
            <h2 className="text-base font-semibold text-muted-foreground">
                {kioskLabels.todayTitle} {operatorName}
            </h2>
            {isLoading ? (
                <p className="text-base text-muted-foreground">
                    {kioskLabels.todayLoading}
                </p>
            ) : hasOutput && summary ? (
                <>
                    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <Stat
                            label={kioskLabels.todayGood}
                            value={formatQuantitySummary(summary.goodByUnit)}
                        />
                        <Stat
                            label={kioskLabels.todayScrap}
                            value={`${summary.scrapKg.toLocaleString('id-ID')} KG`}
                        />
                        <Stat
                            label={kioskLabels.todayJobs}
                            value={String(summary.jobCount)}
                        />
                        <Stat
                            label={kioskLabels.todayActive}
                            value={String(summary.activeJobsCount)}
                        />
                    </dl>
                    {summary.scrapUnverifiedEntries > 0 && (
                        <p className="rounded-xl bg-kiosk-warn-soft p-3 text-base text-kiosk-warn-ink">
                            {summary.scrapUnverifiedEntries} entri affal belum
                            terverifikasi satuannya.
                        </p>
                    )}
                </>
            ) : (
                <p className="text-base text-muted-foreground">
                    {kioskLabels.todayEmpty}
                </p>
            )}
        </section>
    );
}
