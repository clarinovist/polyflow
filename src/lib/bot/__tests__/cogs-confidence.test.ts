import { describe, expect, it } from 'vitest';
import { calculateConfidence } from '../clarifier';
import { buildAssistantProfileInstructions } from '../assistant-profiles';
import { DURABLE_COGS_INSTRUCTIONS, DURABLE_INVENTORY_INSTRUCTIONS } from '../durable/prompt';
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

    it('keeps the inventory answer order and safety semantics aligned in web and durable prompts', () => {
        const web = buildAssistantProfileInstructions({
            pathname: '/finance/reports/general-ledger',
            profile: 'finance',
        }).replace(/\s+/g, ' ');
        const durable = DURABLE_INVENTORY_INSTRUCTIONS.replace(/\s+/g, ' ');
        for (const prompt of [web, durable]) {
            expect(prompt).toMatch(/diagnose_inventory_economic_completeness/i);
            expect(prompt).toMatch(/konsistensi.*inventory GL.*movement\/journal coverage.*valuation.*jurnal inventory tanpa source.*WIP.*return, transfer, adjustment, dan reversal.*Maklon\/off-balance.*confirmed vs needs_review.*opening, cross-period, valuation, lineage, dan truncation/i);
            expect(prompt).toMatch(/Adjustment.*bukan otomatis consumption/i);
            expect(prompt).toMatch(/material issue.*bukan otomatis COGS/i);
            expect(prompt).toMatch(/manual.*journal.*bukan otomatis error|manual inventory journal.*bukan otomatis error/i);
        }
        expect(web).toMatch(/Quantity inventory per variant\/unit.*tidak boleh dijumlahkan lintas unit.*disamakan dengan nilai/i);
        expect(durable).toMatch(/Quantity per variant\/unit.*persisted movement valuation.*posted inventory GL.*WIP.*opening economic value.*basis berbeda/i);
    });
});
