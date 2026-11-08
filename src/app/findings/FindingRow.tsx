import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/utils';
import {
    SEVERITY_LABELS,
    describeFirstSeen,
    describeSla,
    describeSnooze,
    detectorLabel,
} from '@/lib/findings/finding-display';
import { findingEntityHref } from '@/lib/findings/finding-links';
import type { FindingView } from '@/lib/findings/finding-view';

type FindingRowProps = {
    finding: FindingView;
    nowIso: string;
    myUserId: string;
    isBusy: boolean;
    onClaim: (id: string) => void;
    onSnooze: (finding: FindingView) => void;
};

const SLA_TONE_CLASS = {
    none: 'text-muted-foreground',
    ok: 'text-muted-foreground',
    overdue: 'font-medium text-destructive',
} as const;

function SeverityBadge({ severity }: { severity: FindingView['severity'] }) {
    return (
        <Badge
            variant={severity === 'CRITICAL' ? 'destructive' : 'outline'}
            className={
                severity === 'WARNING'
                    ? 'border-amber-500/50 text-amber-700 dark:text-amber-400'
                    : undefined
            }
        >
            {SEVERITY_LABELS[severity]}
        </Badge>
    );
}

function ownerText(finding: FindingView, myUserId: string): string | null {
    if (finding.status !== 'CLAIMED') return null;
    if (finding.claimedById === myUserId) return 'Anda yang menangani';
    return `Diklaim oleh ${finding.claimedByName ?? 'rekan lain'}`;
}

export function FindingRow({
    finding,
    nowIso,
    myUserId,
    isBusy,
    onClaim,
    onSnooze,
}: FindingRowProps) {
    const now = new Date(nowIso);
    const sla = describeSla(finding.slaDueAt, now);
    const href = findingEntityHref(finding);
    const owner = ownerText(finding, myUserId);
    const isSnoozed = finding.status === 'SNOOZED';

    return (
        <li className="space-y-2 px-4 py-3" data-testid="finding-row">
            <div className="flex flex-wrap items-center gap-2">
                <SeverityBadge severity={finding.severity} />
                <span className="text-xs text-muted-foreground">
                    {detectorLabel(finding.detector)}
                </span>
            </div>
            <p className="break-words text-sm font-medium">{finding.headline}</p>
            {finding.detail && (
                <p className="break-words text-sm text-muted-foreground">
                    {finding.detail}
                </p>
            )}
            <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                {isSnoozed ? (
                    <span className="text-muted-foreground">
                        {describeSnooze(finding.snoozedUntil)}
                    </span>
                ) : (
                    <span className={cn(SLA_TONE_CLASS[sla.tone])}>
                        {sla.text}
                    </span>
                )}
                <span className="text-muted-foreground">
                    {describeFirstSeen(finding.firstSeenAt, now)}
                </span>
                {owner && <span className="text-muted-foreground">{owner}</span>}
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
                {finding.status === 'UNCLAIMED' && (
                    <Button
                        size="sm"
                        disabled={isBusy}
                        onClick={() => onClaim(finding.id)}
                    >
                        Klaim
                    </Button>
                )}
                {!isSnoozed && (
                    <Button
                        size="sm"
                        variant="outline"
                        disabled={isBusy}
                        onClick={() => onSnooze(finding)}
                    >
                        Tunda
                    </Button>
                )}
                {href && (
                    <Button asChild size="sm" variant="ghost">
                        <Link href={href}>
                            <ExternalLink aria-hidden="true" />
                            Buka
                        </Link>
                    </Button>
                )}
            </div>
        </li>
    );
}
