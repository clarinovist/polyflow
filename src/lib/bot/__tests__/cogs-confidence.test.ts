import { describe, expect, it } from 'vitest';
import { calculateConfidence } from '../clarifier';
import { buildAssistantProfileInstructions } from '../assistant-profiles';
import { DURABLE_COGS_INSTRUCTIONS } from '../durable/prompt';
import type { ToolEvidence } from '../assistant-types';

const evidence = (confidenceCap?: ToolEvidence['confidenceCap']): ToolEvidence => ({
    summary: 'Synthetic diagnosis evidence',
    facts: [],
    source: 'tenant-data',
    checkedAt: '2026-10-12T00:00:00.000Z',
    completeness: confidenceCap === 0.9 ? 'complete' : 'partial',
    ...(confidenceCap ? { confidenceCap } : {}),
});

describe('coverage-aware COGS assistant semantics', () => {
    it.each([0.6, 0.75, 0.85, 0.9] as const)(
        'uses deterministic coverage cap %s instead of legacy 0.7/0.3',
        cap => {
            expect(calculateConfidence([evidence(cap)], false)).toBe(cap);
        },
    );

    it('uses the most conservative structured cap and keeps clarification conservative', () => {
        expect(calculateConfidence([evidence(0.9), evidence(0.75)], false)).toBe(0.75);
        expect(calculateConfidence([evidence(0.9)], true)).toBe(0.3);
    });

    it('keeps the same bookkeeping, finding-status and amount-basis rules in web and durable prompts', () => {
        const web = buildAssistantProfileInstructions({
            pathname: '/finance/reports/income-statement',
            profile: 'finance',
        });
        const durable = DURABLE_COGS_INSTRUCTIONS;
        const webCompact = web.replace(/\s+/g, ' ');
        const durableCompact = durable.replace(/\s+/g, ' ');
        expect(webCompact).toMatch(/konsistensi bookkeeping.*bukan kelengkapan ekonomi/i);
        expect(webCompact).toMatch(/terkonfirmasi.*needs_review/i);
        expect(webCompact).toMatch(/Jangan gabungkan nominal sales, movement valuation, jurnal GL/i);
        expect(webCompact).toMatch(/laporan vs jurnal.*cost coverage seluruh shipment.*simetri retur.*WIP\/inventory/i);
        expect(durableCompact).toMatch(/konsistensi bookkeeping.*bukan kelengkapan ekonomi/i);
        expect(durableCompact).toMatch(/terkonfirmasi.*needs_review/i);
        expect(durableCompact).toMatch(/jangan gabungkan nominal sales, movement valuation, jurnal GL/i);
        expect(durableCompact).toMatch(/laporan vs jurnal.*cost coverage seluruh shipment.*simetri retur.*WIP\/inventory/i);
    });
});
