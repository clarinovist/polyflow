import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatRupiah } from '@/lib/utils/utils';
import { describeAgeSpan } from '@/lib/findings/finding-display';
import { summarizeGroup } from '@/lib/findings/finding-groups';
import type { FindingGroup } from '@/lib/findings/finding-groups';
import type { FindingView } from '@/lib/findings/finding-view';
import { FindingRow } from './FindingRow';

// Small groups start expanded; a 40-invoice supplier starts collapsed.
const OPEN_BY_DEFAULT_LIMIT = 3;

type FindingGroupCardProps = {
    group: FindingGroup;
    nowIso: string;
    myUserId: string;
    isBusy: boolean;
    onClaim: (ids: readonly string[]) => void;
    onSnooze: (ids: readonly string[], label: string) => void;
};

function summaryText(group: FindingGroup, nowIso: string): string {
    const summary = summarizeGroup(group);
    const parts = [`${summary.count} temuan`];
    if (summary.outstandingTotal !== null) {
        parts.push(`sisa ${formatRupiah(summary.outstandingTotal)}`);
    }
    if (summary.maxDaysOverdue !== null) {
        parts.push(`terlama lewat ${summary.maxDaysOverdue} hari`);
    } else {
        const age = describeAgeSpan(summary.oldestFirstSeenAt, new Date(nowIso));
        if (age) parts.push(`tertua ${age}`);
    }
    return parts.join(' · ');
}

export function FindingGroupCard({
    group,
    nowIso,
    myUserId,
    isBusy,
    onClaim,
    onSnooze,
}: FindingGroupCardProps) {
    const summary = summarizeGroup(group);
    const snoozableIds = group.items
        .filter((item: FindingView) => item.status !== 'SNOOZED')
        .map((item) => item.id);
    const rows = (
        <ul className="divide-y">
            {group.items.map((finding) => (
                <FindingRow
                    key={finding.id}
                    finding={finding}
                    nowIso={nowIso}
                    myUserId={myUserId}
                    isBusy={isBusy}
                    onClaim={(id) => onClaim([id])}
                    onSnooze={(item) => onSnooze([item.id], item.headline)}
                />
            ))}
        </ul>
    );

    if (group.items.length === 1) {
        return (
            <section className="rounded-lg border bg-card">{rows}</section>
        );
    }

    return (
        <section
            className="rounded-lg border bg-card"
            aria-label={`Kelompok ${group.label}`}
        >
            <div className="space-y-2 border-b px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                    <h3 className="break-words text-sm font-semibold">
                        {group.label}
                    </h3>
                    <Badge variant="secondary">{summary.count}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                    {summaryText(group, nowIso)}
                </p>
                <div className="flex flex-wrap gap-2">
                    {summary.claimableIds.length > 0 && (
                        <Button
                            size="sm"
                            disabled={isBusy}
                            onClick={() => onClaim(summary.claimableIds)}
                        >
                            Klaim semua ({summary.claimableIds.length})
                        </Button>
                    )}
                    {snoozableIds.length > 0 && (
                        <Button
                            size="sm"
                            variant="outline"
                            disabled={isBusy}
                            onClick={() => onSnooze(snoozableIds, group.label)}
                        >
                            Tunda semua ({snoozableIds.length})
                        </Button>
                    )}
                </div>
            </div>
            <details open={summary.count <= OPEN_BY_DEFAULT_LIMIT}>
                <summary className="cursor-pointer px-4 py-2 text-sm text-muted-foreground">
                    Lihat {summary.count} temuan
                </summary>
                {rows}
            </details>
        </section>
    );
}
