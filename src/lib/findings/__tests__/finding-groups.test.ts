import { describe, expect, it } from 'vitest';
import {
    extractCounterparty,
    groupFindings,
    summarizeGroup,
} from '../finding-groups';
import type { FindingView } from '../finding-view';

const ME = 'user-me';
const OTHER = 'user-other';

let seq = 0;
function makeFinding(overrides: Partial<FindingView> = {}): FindingView {
    seq += 1;
    return {
        id: `f-${seq}`,
        fingerprint: `overdue_ar:inv-${seq}`,
        detector: 'overdue_ar',
        severity: 'WARNING',
        status: 'UNCLAIMED',
        headline: `Invoice INV-${seq} — Customer A (SO: SO-${seq})`,
        detail: 'Lewat jatuh tempo 5 hari, sisa Rp 1.000.000',
        entityType: 'Invoice',
        entityId: `inv-${seq}`,
        slaDueAt: '2026-11-10T00:00:00.000Z',
        snoozedUntil: null,
        firstSeenAt: '2026-11-01T00:00:00.000Z',
        claimedById: null,
        claimedByName: null,
        ...overrides,
    };
}

function arFinding(
    name: string,
    overrides: Partial<FindingView> = {},
): FindingView {
    return makeFinding({
        headline: `Invoice INV-${seq + 1} — ${name} (SO: SO-1)`,
        ...overrides,
    });
}

function apFinding(
    name: string,
    overrides: Partial<FindingView> = {},
): FindingView {
    return makeFinding({
        detector: 'overdue_ap',
        entityType: 'PurchaseInvoice',
        headline: `Invoice INV-${seq + 1} — ${name} (PO: PO-1)`,
        ...overrides,
    });
}

describe('extractCounterparty', () => {
    it('reads the customer name from an overdue_ar headline', () => {
        const finding = makeFinding({
            headline: 'Invoice INV-001 — Customer A (SO: SO-77)',
        });
        expect(extractCounterparty(finding)).toBe('Customer A');
    });

    it('reads the supplier name from an overdue_ap headline', () => {
        const finding = apFinding('Supplier B', {
            headline: 'Invoice INV-9 — Supplier B (PO: PO-3)',
        });
        expect(extractCounterparty(finding)).toBe('Supplier B');
    });

    it('keeps the placeholder name when the invoice has no counterparty', () => {
        const finding = makeFinding({
            headline: 'Invoice INV-1 — Tanpa customer (SO: -)',
        });
        expect(extractCounterparty(finding)).toBe('Tanpa customer');
    });

    it('keeps a name that contains a dash separator or parentheses', () => {
        const finding = makeFinding({
            headline: 'Invoice INV-2 — PT Maju — Cabang (Timur) (SO: SO-5)',
        });
        expect(extractCounterparty(finding)).toBe('PT Maju — Cabang (Timur)');
    });

    it('returns null when the headline does not match the template', () => {
        const finding = makeFinding({ headline: 'Sesuatu yang lain' });
        expect(extractCounterparty(finding)).toBeNull();
    });

    it('returns null for detectors that have no counterparty', () => {
        const finding = makeFinding({
            detector: 'missing_finance_journal',
            headline: 'Invoice INV-1 — Customer A (SO: SO-1)',
        });
        expect(extractCounterparty(finding)).toBeNull();
    });
});

describe('groupFindings sections', () => {
    it('puts claimed-by-me findings in "Saya tangani" before anything else', () => {
        const mine = makeFinding({
            status: 'CLAIMED',
            claimedById: ME,
            slaDueAt: '2026-11-10T00:00:00.000Z',
        });

        const sections = groupFindings([mine], ME);

        expect(sections.map((s) => s.key)).toEqual(['saya']);
        expect(sections[0].title).toBe('Saya tangani');
    });

    it('splits "Baru" (has SLA) from "Tunggakan lama" (no SLA)', () => {
        const fresh = makeFinding({ slaDueAt: '2026-11-10T00:00:00.000Z' });
        const legacy = makeFinding({ slaDueAt: null });

        const sections = groupFindings([legacy, fresh], ME);

        expect(sections.map((s) => [s.key, s.count])).toEqual([
            ['baru', 1],
            ['tunggakan', 1],
        ]);
        expect(sections[0].title).toBe('Baru');
        expect(sections[1].title).toBe('Tunggakan lama');
    });

    it('keeps findings claimed by someone else in their SLA section', () => {
        const theirs = makeFinding({ status: 'CLAIMED', claimedById: OTHER });

        const sections = groupFindings([theirs], ME);

        expect(sections.map((s) => s.key)).toEqual(['baru']);
    });

    it('lists snoozed findings separately even when claimed by me', () => {
        const snoozed = makeFinding({
            status: 'SNOOZED',
            claimedById: ME,
            snoozedUntil: '2026-11-12T00:00:00.000Z',
        });

        const sections = groupFindings([snoozed], ME);

        expect(sections.map((s) => s.key)).toEqual(['ditunda']);
    });

    it('orders sections saya, baru, tunggakan, ditunda and omits empty ones', () => {
        const findings = [
            makeFinding({ status: 'SNOOZED' }),
            makeFinding({ slaDueAt: null }),
            makeFinding({ slaDueAt: '2026-11-10T00:00:00.000Z' }),
            makeFinding({ status: 'CLAIMED', claimedById: ME }),
        ];

        const sections = groupFindings(findings, ME);

        expect(sections.map((s) => s.key)).toEqual([
            'saya',
            'baru',
            'tunggakan',
            'ditunda',
        ]);
    });

    it('returns no sections for an empty list', () => {
        expect(groupFindings([], ME)).toEqual([]);
    });

    it('does not mutate its input', () => {
        const findings = [
            makeFinding({ slaDueAt: null }),
            makeFinding({ severity: 'CRITICAL' }),
        ];
        const snapshot = JSON.parse(JSON.stringify(findings));

        groupFindings(findings, ME);

        expect(findings).toEqual(snapshot);
    });
});

describe('groupFindings grouping', () => {
    it('groups AR findings per customer within a section', () => {
        const findings = [
            arFinding('Customer A'),
            arFinding('Customer B'),
            arFinding('Customer A'),
        ];

        const [section] = groupFindings(findings, ME);

        const byLabel = Object.fromEntries(
            section.groups.map((g) => [g.label, g.items.length]),
        );
        expect(byLabel).toEqual({ 'Customer A': 2, 'Customer B': 1 });
        expect(section.groups.every((g) => g.kind === 'counterparty')).toBe(
            true,
        );
    });

    it('never merges AR and AP groups that share a counterparty name', () => {
        const findings = [arFinding('Same Name'), apFinding('Same Name')];

        const [section] = groupFindings(findings, ME);

        expect(section.groups).toHaveLength(2);
        expect(section.groups.map((g) => g.detector).sort()).toEqual([
            'overdue_ap',
            'overdue_ar',
        ]);
    });

    it('treats counterparty names case- and space-insensitively', () => {
        const findings = [
            arFinding('Customer A'),
            arFinding('  customer a '),
        ];

        const [section] = groupFindings(findings, ME);

        expect(section.groups).toHaveLength(1);
    });

    it('does not group an unparseable AR headline with a named counterparty', () => {
        const findings = [
            arFinding('Customer A'),
            makeFinding({ headline: 'format tak dikenal' }),
        ];

        const [section] = groupFindings(findings, ME);

        expect(section.groups).toHaveLength(2);
        expect(section.groups.map((g) => g.kind).sort()).toEqual([
            'counterparty',
            'detector',
        ]);
    });

    it('groups non-AR/AP findings by detector', () => {
        const stock = (id: string) =>
            makeFinding({
                id,
                detector: 'critical_stock',
                entityType: 'ProductVariant',
                headline: `Varian ${id}: 1 < 10`,
            });

        const [section] = groupFindings([stock('a'), stock('b')], ME);

        expect(section.groups).toHaveLength(1);
        expect(section.groups[0].kind).toBe('detector');
        expect(section.groups[0].label).toBe('Stok kritis');
    });

    it('does not mix sections: same customer in Baru and Tunggakan makes two groups', () => {
        const findings = [
            arFinding('Customer A', { slaDueAt: '2026-11-10T00:00:00.000Z' }),
            arFinding('Customer A', { slaDueAt: null }),
        ];

        const sections = groupFindings(findings, ME);

        expect(sections).toHaveLength(2);
        expect(sections.every((s) => s.groups.length === 1)).toBe(true);
    });

    it('sorts groups by worst severity, then oldest first seen', () => {
        const findings = [
            arFinding('Calm Old', {
                severity: 'WARNING',
                firstSeenAt: '2026-10-01T00:00:00.000Z',
            }),
            arFinding('Hot New', {
                severity: 'CRITICAL',
                firstSeenAt: '2026-11-05T00:00:00.000Z',
            }),
            arFinding('Calm Newer', {
                severity: 'WARNING',
                firstSeenAt: '2026-10-20T00:00:00.000Z',
            }),
        ];

        const [section] = groupFindings(findings, ME);

        expect(section.groups.map((g) => g.label)).toEqual([
            'Hot New',
            'Calm Old',
            'Calm Newer',
        ]);
    });

    it('sorts items inside a group critical first, then oldest first', () => {
        const older = arFinding('Customer A', {
            id: 'older',
            firstSeenAt: '2026-10-01T00:00:00.000Z',
        });
        const critical = arFinding('Customer A', {
            id: 'critical',
            severity: 'CRITICAL',
            firstSeenAt: '2026-10-15T00:00:00.000Z',
        });
        const newer = arFinding('Customer A', {
            id: 'newer',
            firstSeenAt: '2026-10-10T00:00:00.000Z',
        });

        const [section] = groupFindings([newer, older, critical], ME);

        expect(section.groups[0].items.map((f) => f.id)).toEqual([
            'critical',
            'older',
            'newer',
        ]);
    });
});

describe('summarizeGroup', () => {
    it('totals outstanding amount and reports the longest overdue days', () => {
        const [section] = groupFindings(
            [
                arFinding('Customer A', {
                    detail: 'Lewat jatuh tempo 5 hari, sisa Rp 1.000.000',
                }),
                arFinding('Customer A', {
                    detail: 'Lewat jatuh tempo 40 hari, sisa Rp 2.500.000',
                }),
            ],
            ME,
        );

        const summary = summarizeGroup(section.groups[0]);

        expect(summary.count).toBe(2);
        expect(summary.outstandingTotal).toBe(3_500_000);
        expect(summary.maxDaysOverdue).toBe(40);
        expect(summary.highestSeverity).toBe('WARNING');
    });

    it('omits the total when any amount cannot be read', () => {
        const [section] = groupFindings(
            [
                arFinding('Customer A', {
                    detail: 'Lewat jatuh tempo 5 hari, sisa Rp 1.000.000',
                }),
                arFinding('Customer A', { detail: 'format tak dikenal' }),
            ],
            ME,
        );

        const summary = summarizeGroup(section.groups[0]);

        expect(summary.outstandingTotal).toBeNull();
        expect(summary.maxDaysOverdue).toBe(5);
    });

    it('reads decimal amounts written in id-ID format', () => {
        const [section] = groupFindings(
            [
                arFinding('Customer A', {
                    detail: 'Lewat jatuh tempo 3 hari, sisa Rp 1.234.567,5',
                }),
            ],
            ME,
        );

        expect(summarizeGroup(section.groups[0]).outstandingTotal).toBe(
            1_234_567.5,
        );
    });

    it('reports the claimable ids and the oldest first-seen date', () => {
        const [section] = groupFindings(
            [
                arFinding('Customer A', {
                    id: 'open',
                    firstSeenAt: '2026-10-05T00:00:00.000Z',
                }),
                arFinding('Customer A', {
                    id: 'taken',
                    status: 'CLAIMED',
                    claimedById: OTHER,
                    firstSeenAt: '2026-09-01T00:00:00.000Z',
                }),
            ],
            ME,
        );

        const summary = summarizeGroup(section.groups[0]);

        expect(summary.claimableIds).toEqual(['open']);
        expect(summary.oldestFirstSeenAt).toBe('2026-09-01T00:00:00.000Z');
    });
});
