import { detectorLabel } from './finding-display';
import type { FindingView, FindingViewSeverity } from './finding-view';

type FindingSectionKey = 'saya' | 'baru' | 'tunggakan' | 'ditunda';

export type FindingGroup = {
    /** Stable React key: section + detector + normalized counterparty. */
    key: string;
    kind: 'counterparty' | 'detector';
    label: string;
    detector: string;
    items: readonly FindingView[];
};

export type FindingSection = {
    key: FindingSectionKey;
    title: string;
    count: number;
    groups: readonly FindingGroup[];
};

export type FindingGroupSummary = {
    count: number;
    highestSeverity: FindingViewSeverity;
    oldestFirstSeenAt: string;
    outstandingTotal: number | null;
    maxDaysOverdue: number | null;
    /** UNCLAIMED members: the only ones `claimFinding` can take. */
    claimableIds: readonly string[];
    /** Every member a group snooze would apply to. */
    snoozableIds: readonly string[];
};

const SECTION_ORDER: readonly FindingSectionKey[] = [
    'saya',
    'baru',
    'tunggakan',
    'ditunda',
];

const SECTION_TITLES: Record<FindingSectionKey, string> = {
    saya: 'Saya tangani',
    baru: 'Baru',
    tunggakan: 'Tunggakan lama',
    ditunda: 'Ditunda',
};

// The overdue AR/AP detectors store only the counterparty *name*, inside the
// headline built in telegram/digest/detectors.ts:
//   `Invoice <no> — <customer> (SO: <so>)` / `Invoice <no> — <supplier> (PO: <po>)`.
// No customer/supplier id is persisted, so grouping is by name and depends on
// that template. Anything that does not match is left ungrouped, never guessed.
const COUNTERPARTY_HEADLINE: Readonly<Record<string, RegExp>> = {
    overdue_ar: /^Invoice\s+\S+\s+—\s+(.+?)\s+\(SO:\s[^)]*\)$/,
    overdue_ap: /^Invoice\s+\S+\s+—\s+(.+?)\s+\(PO:\s[^)]*\)$/,
};

export function extractCounterparty(
    finding: Pick<FindingView, 'detector' | 'headline'>,
): string | null {
    const pattern = COUNTERPARTY_HEADLINE[finding.detector];
    if (!pattern) return null;
    const name = pattern.exec(finding.headline.trim())?.[1]?.trim();
    return name ? name : null;
}

function normalizeName(name: string): string {
    return name.replace(/\s+/g, ' ').trim().toLowerCase();
}

function sectionOf(finding: FindingView, myUserId: string): FindingSectionKey {
    if (finding.status === 'SNOOZED') return 'ditunda';
    if (finding.status === 'CLAIMED' && finding.claimedById === myUserId) {
        return 'saya';
    }
    return finding.slaDueAt != null ? 'baru' : 'tunggakan';
}

function severityRank(severity: FindingViewSeverity): number {
    return severity === 'CRITICAL' ? 1 : 0;
}

function compareFindings(a: FindingView, b: FindingView): number {
    return (
        severityRank(b.severity) - severityRank(a.severity) ||
        a.firstSeenAt.localeCompare(b.firstSeenAt) ||
        a.id.localeCompare(b.id)
    );
}

function groupKeyOf(
    section: FindingSectionKey,
    finding: FindingView,
): { key: string; kind: FindingGroup['kind']; label: string } {
    const counterparty = extractCounterparty(finding);
    if (counterparty) {
        return {
            key: `${section}:${finding.detector}:${normalizeName(counterparty)}`,
            kind: 'counterparty',
            label: counterparty,
        };
    }
    return {
        key: `${section}:${finding.detector}`,
        kind: 'detector',
        label: detectorLabel(finding.detector),
    };
}

function buildGroups(
    section: FindingSectionKey,
    findings: readonly FindingView[],
): FindingGroup[] {
    const byKey = new Map<string, FindingGroup>();
    for (const finding of findings) {
        const { key, kind, label } = groupKeyOf(section, finding);
        const existing = byKey.get(key);
        byKey.set(key, {
            key,
            kind,
            label: existing?.label ?? label,
            detector: finding.detector,
            items: [...(existing?.items ?? []), finding],
        });
    }
    return [...byKey.values()]
        .map((group) => ({
            ...group,
            items: [...group.items].sort(compareFindings),
        }))
        .sort((a, b) => compareFindings(a.items[0], b.items[0]));
}

/**
 * Splits findings into mutually exclusive sections and groups them.
 * Order of precedence: snoozed, claimed by me, then SLA (Baru) vs baseline.
 * Pure: the input is never mutated.
 */
export function groupFindings(
    findings: readonly FindingView[],
    myUserId: string,
): FindingSection[] {
    const bySection = new Map<FindingSectionKey, FindingView[]>();
    for (const finding of findings) {
        const section = sectionOf(finding, myUserId);
        bySection.set(section, [...(bySection.get(section) ?? []), finding]);
    }
    return SECTION_ORDER.flatMap((key) => {
        const members = bySection.get(key);
        if (!members) return [];
        return [
            {
                key,
                title: SECTION_TITLES[key],
                count: members.length,
                groups: buildGroups(key, members),
            },
        ];
    });
}

// `Rp 1.234.567` or `Rp 1.234.567,5` as written by toLocaleString('id-ID').
const OUTSTANDING_PATTERN = /sisa Rp ([\d.]+(?:,\d+)?)/;
const DAYS_OVERDUE_PATTERN = /Lewat jatuh tempo (\d+) hari/;

function parseOutstanding(detail: string | null): number | null {
    const raw = detail ? OUTSTANDING_PATTERN.exec(detail)?.[1] : undefined;
    if (!raw) return null;
    const value = Number(raw.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(value) ? value : null;
}

function parseDaysOverdue(detail: string | null): number | null {
    const raw = detail ? DAYS_OVERDUE_PATTERN.exec(detail)?.[1] : undefined;
    return raw ? Number(raw) : null;
}

function sumOrNull(values: readonly (number | null)[]): number | null {
    if (values.length === 0 || values.some((value) => value === null)) {
        return null;
    }
    return (values as number[]).reduce((total, value) => total + value, 0);
}

function maxOrNull(values: readonly (number | null)[]): number | null {
    const known = values.filter((value): value is number => value !== null);
    return known.length > 0 ? Math.max(...known) : null;
}

export function summarizeGroup(group: FindingGroup): FindingGroupSummary {
    const items = group.items;
    const isOverdueDetector = items.every(
        (item) =>
            item.detector === 'overdue_ar' || item.detector === 'overdue_ap',
    );
    return {
        count: items.length,
        highestSeverity: items.some((item) => item.severity === 'CRITICAL')
            ? 'CRITICAL'
            : 'WARNING',
        oldestFirstSeenAt: items.reduce(
            (oldest, item) =>
                item.firstSeenAt < oldest ? item.firstSeenAt : oldest,
            items[0].firstSeenAt,
        ),
        outstandingTotal: isOverdueDetector
            ? sumOrNull(items.map((item) => parseOutstanding(item.detail)))
            : null,
        maxDaysOverdue: isOverdueDetector
            ? maxOrNull(items.map((item) => parseDaysOverdue(item.detail)))
            : null,
        claimableIds: items
            .filter((item) => item.status === 'UNCLAIMED')
            .map((item) => item.id),
        snoozableIds: items.map((item) => item.id),
    };
}
