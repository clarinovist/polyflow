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
        expect(webCompact).toMatch(/Jangan gabungkan nilai penjualan, biaya pergerakan barang, jurnal persediaan/i);
        expect(webCompact).toMatch(/laporan vs jurnal.*cost coverage seluruh shipment.*simetri retur.*WIP\/inventory/i);
        expect(durableCompact).toMatch(/konsistensi bookkeeping.*bukan kelengkapan ekonomi/i);
        expect(durableCompact).toMatch(/terkonfirmasi.*needs_review/i);
        expect(durableCompact).toMatch(/jangan gabungkan nominal sales, movement valuation, jurnal GL/i);
        expect(durableCompact).toMatch(/laporan vs jurnal.*cost coverage seluruh shipment.*simetri retur.*WIP\/inventory/i);
    });

    it('keeps a plain-language default and technical detail only on explicit request in web and durable prompts', () => {
        const web = buildAssistantProfileInstructions({
            pathname: '/finance/reports/general-ledger',
            profile: 'finance',
        }).replace(/\s+/g, ' ');
        const durable = DURABLE_INVENTORY_INSTRUCTIONS.replace(/\s+/g, ' ');
        for (const prompt of [web, durable]) {
            expect(prompt).toMatch(/diagnose_inventory_economic_completeness/i);
            expect(prompt).toMatch(/Kesimpulan.*Penyebab utama.*Yang perlu diperiksa.*Batas pemeriksaan/i);
            expect(prompt).toMatch(/bahasa bisnis sehari-hari/i);
            expect(prompt).toMatch(/jika pengguna.*meminta detail teknis|bila pengguna.*meminta detail teknis/i);
            expect(prompt).toMatch(/Detail teknis untuk Finance/i);
            expect(prompt).toMatch(/Penyesuaian stok bukan otomatis pemakaian bahan/i);
            expect(prompt).toMatch(/belum tentu langsung menjadi HPP|bukan otomatis HPP/i);
            expect(prompt).toMatch(/bukan otomatis salah/i);
        }
        expect(web).toMatch(/Jumlah barang.*tidak boleh dijumlahkan lintas satuan.*disamakan dengan nilai rupiah/i);
        expect(durable).toMatch(/Jangan tampilkan kode kondisi.*confidence cap.*amount basis.*sample ID/i);
        expect(durable).toMatch(/inventory GL = catatan nilai persediaan di pembukuan/i);
    });
});
