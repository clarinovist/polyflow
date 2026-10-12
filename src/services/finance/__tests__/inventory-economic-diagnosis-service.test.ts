import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import {
    assembleInventoryEconomicDiagnosis,
    diagnoseInventoryEconomicCompleteness,
} from '../inventory-economic-diagnosis-service';

const range = {
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    start: new Date('2026-07-31T17:00:00.000Z'),
    end: new Date('2026-08-31T16:59:59.999Z'),
};
const sample = (sourceId: string, materiality: string, unit = 'KG') => ({
    sourceId,
    flow: 'shipment',
    unit,
    amount: materiality,
    materiality,
    reason: 'sample',
});
const finding = (
    code: string,
    amountBasis: string,
    amount: string,
    sourceId = code.toLowerCase(),
) => ({
    code,
    area: 'movement',
    flow: 'shipment',
    amountBasis,
    count: 1,
    amount,
    materiality: amount,
    reason: code + ' confirmed',
    evidenceLimit: 'Accounting implication needs review.',
    samples: [sample(sourceId, amount)],
});
const payload = (
    metrics: Record<string, string | number>,
    findings: unknown[] = [],
    quantities: unknown[] = [],
) => [{ payload: { metrics, findings, quantities } }];

function completeRows() {
    return {
        gl: payload({
            accountCount: 2,
            mappedProductCount: 2,
            unmappedProductCount: 0,
            openingBalance: '1000',
            periodDebit: '500',
            periodCredit: '300',
            closingBalance: '1200',
            journalCount: 4,
            manualJournalCount: 0,
            orphanJournalCount: 0,
            closingReferenceCount: 0,
        }),
        movements: payload(
            {
                movementCount: 0,
                coveredCount: 0,
                unvaluedCount: 0,
                withoutJournalCount: 0,
                invalidJournalCount: 0,
                valueMismatchCount: 0,
                semanticRoleUnknownCount: 0,
                validReversalCount: 0,
                invalidReversalCount: 0,
                crossPeriodReversalCount: 0,
                receiptCount: 0,
                shipmentCount: 0,
                issueCount: 0,
                outputCount: 0,
                goodReturnCount: 0,
                damagedReturnCount: 0,
                purchaseReturnCount: 0,
                adjustmentGainCount: 0,
                adjustmentLossCount: 0,
                internalTransferCount: 0,
                offBalanceCount: 0,
                crossPeriodProductionCount: 0,
            },
            [],
            [
                {
                    productVariantId: 'kg-variant',
                    unit: 'KG',
                    inbound: '10',
                    outbound: '2',
                    transfer: '1',
                },
                {
                    productVariantId: 'pcs-variant',
                    unit: 'PCS',
                    inbound: '3',
                    outbound: '1',
                    transfer: '0',
                },
            ],
        ),
    };
}

async function diagnosisSql() {
    const rows = completeRows();
    const query = vi
        .fn()
        .mockResolvedValueOnce(rows.gl)
        .mockResolvedValueOnce(rows.movements);
    await diagnoseInventoryEconomicCompleteness(
        { $queryRaw: query } as unknown as Prisma.TransactionClient,
        { startDate: range.startDate, endDate: range.endDate },
    );
    return query.mock.calls.map((call) => call[0].strings.join(' ')).join('\n');
}

describe('inventory economic diagnosis contract', () => {
    it.each([
        ['mapped inventory scope excludes broad assets', ['inventoryAccountId', `p."productType" <> 'FIXED_ASSET'`, "a.type = 'ASSET'"]],
        ['GL opening activity closing includes closing postings', ['openingBalance', 'periodDebit', 'closingBalance', 'CLOSING_INVENTORY_JOURNAL_REVIEW']],
        ['movement journal lineage and vectors', ['INVENTORY_MOVEMENT_WITHOUT_JOURNAL', 'INVENTORY_JOURNAL_VECTOR_INVALID', 'MOVEMENT_JOURNAL_VALUE_MISMATCH']],
        ['receipt shipment issue and output flow', ["THEN 'receipt'", "THEN 'shipment'", "THEN 'production_issue'", "THEN 'production_output'"]],
        ['GOOD and DAMAGED return semantics', ['sales_return_good', "i.condition = 'DAMAGED'", 'purchase_return']],
        ['adjustment is gain/loss not consumption', ['INVENTORY_ADJUSTMENT_GAIN_LOSS', 'adjustment_gain', 'adjustment_loss']],
        ['internal transfer no journal expected', ['TRANSFER_NON_FINANCIAL_EXPECTED', `"fromLocationType" = 'INTERNAL'`]],
        ['Maklon and customer-owned exclusion', ['OFF_BALANCE_MOVEMENT_EXCLUDED', 'CUSTOMER_OWNED', 'receiptMaklon', 'productionMaklon']],
        ['exact, invalid and cross-period reversal', ['VALID_INVENTORY_REVERSAL', 'INVALID_INVENTORY_REVERSAL', 'CROSS_PERIOD_INVENTORY_REVERSAL', 'inverseJournal']],
        ['material issue may remain in WIP', ['MATERIAL_COST_REMAINS_IN_WIP', 'production_cross_period']],
        ['stable aggregate before sample bound', ['ROW_NUMBER() OVER', 'materiality DESC', 'FILTER (WHERE rn <=']],
        ['WIB boundaries and no current Inventory snapshot', ['m."createdAt" >=', 'm."createdAt" <=']],
    ] as const)('encodes %s', async (_scenario, tokens) => {
        const sql = await diagnosisSql();
        for (const token of tokens) expect(sql).toContain(token);
        expect(sql).not.toContain('FROM "Inventory"');
        expect(sql).not.toContain("a.category = 'CURRENT_ASSET'");
    });

    it('orders comparable finding groups by aggregate materiality, not the largest sample row', () => {
        const rows = completeRows();
        rows.movements = payload(
            (rows.movements[0].payload as { metrics: Record<string, string | number> }).metrics,
            [
                {
                    ...finding('MANY_ROWS', 'persisted_movement_value', '3000', 'many-1'),
                    count: 3,
                    materiality: '3000',
                    samples: [
                        sample('many-1', '1000'),
                        sample('many-2', '1000'),
                        sample('many-3', '1000'),
                    ],
                },
                finding('ONE_ROW', 'persisted_movement_value', '2000', 'one-1'),
            ],
        );
        expect(
            assembleInventoryEconomicDiagnosis(range, rows).findings
                .filter((row) => row.amountBasis === 'persisted_movement_value')
                .map((row) => row.code),
        ).toEqual(['MANY_ROWS', 'ONE_ROW']);
    });

    it('keeps incompatible bases separated, sorts only within basis and keeps quantity by variant/unit', () => {
        const rows = completeRows();
        rows.gl = payload(
            (rows.gl[0].payload as { metrics: Record<string, string | number> }).metrics,
            [finding('ORPHAN_SMALL', 'posted_inventory_gl', '50', 'g-small')],
        );
        rows.movements = payload(
            (rows.movements[0].payload as { metrics: Record<string, string | number> }).metrics,
            [
                finding('MOVEMENT_BIG', 'persisted_movement_value', '900', 'm-big'),
                finding('GL_BIG', 'posted_inventory_gl', '600', 'g-big'),
            ],
            (completeRows().movements[0].payload as { quantities: unknown[] }).quantities,
        );
        const result = assembleInventoryEconomicDiagnosis(range, rows);
        expect(result.findings.slice(0, 3).map((row) => row.code)).toEqual([
            'GL_BIG',
            'ORPHAN_SMALL',
            'MOVEMENT_BIG',
        ]);
        expect(result.findings.every((row) => row.conditionStatus === 'confirmed')).toBe(true);
        expect(result.findings.every((row) => row.accountingConclusion === 'needs_review')).toBe(true);
        expect(result.findings.find((row) => row.code === 'GL_BIG')?.glActivityPercentage).toBe(75);
        expect(result.findings.find((row) => row.code === 'MOVEMENT_BIG')?.glActivityPercentage).toBeNull();
        expect(result.movementCoverage.quantities).toEqual([
            expect.objectContaining({ productVariantId: 'kg-variant', unit: 'KG', inbound: 10 }),
            expect.objectContaining({ productVariantId: 'pcs-variant', unit: 'PCS', inbound: 3 }),
        ]);
    });

    it('uses deterministic coverage caps without treating classified side flows as missing coverage', () => {
        const coveredRows = completeRows();
        coveredRows.gl = payload({
            ...(coveredRows.gl[0].payload as { metrics: Record<string, string | number> }).metrics,
            accountCount: 0,
            mappedProductCount: 0,
            openingBalance: 0,
            periodDebit: 0,
            periodCredit: 0,
            closingBalance: 0,
        });
        const covered = assembleInventoryEconomicDiagnosis(range, coveredRows);
        expect(covered.coverage).toMatchObject({ mandatoryComplete: true, confidenceCap: 0.9 });

        const openingPartial = completeRows();
        (openingPartial.movements[0].payload as { metrics: Record<string, number> }).metrics.movementCount = 1;
        expect(assembleInventoryEconomicDiagnosis(range, openingPartial).coverage.confidenceCap).toBe(0.85);

        const valuationPartial = completeRows();
        (valuationPartial.movements[0].payload as { metrics: Record<string, number> }).metrics.unvaluedCount = 1;
        expect(assembleInventoryEconomicDiagnosis(range, valuationPartial).coverage.confidenceCap).toBe(0.75);

        const accountPartial = completeRows();
        (accountPartial.gl[0].payload as { metrics: Record<string, number> }).metrics.unmappedProductCount = 1;
        expect(assembleInventoryEconomicDiagnosis(range, accountPartial).coverage.confidenceCap).toBe(0.6);

        const missing = assembleInventoryEconomicDiagnosis(range, { gl: [], movements: [] });
        expect(missing.coverage).toMatchObject({ mandatoryComplete: false, confidenceCap: 0.6 });

        const sideFlows = completeRows();
        Object.assign(
            (sideFlows.movements[0].payload as { metrics: Record<string, number> }).metrics,
            { adjustmentGainCount: 1, internalTransferCount: 1, offBalanceCount: 1 },
        );
        expect(assembleInventoryEconomicDiagnosis(range, sideFlows).coverage.mandatoryComplete).toBe(false);
        expect(assembleInventoryEconomicDiagnosis(range, sideFlows).coverage.dimensions.find((item) => item.code === 'ADJUSTMENT_TRANSFER_OFF_BALANCE')).toMatchObject({ status: 'covered' });
    });

    it('marks economic opening unavailable without inventing a stock-value roll-forward', () => {
        const rows = completeRows();
        (rows.movements[0].payload as { metrics: Record<string, number> }).metrics.movementCount = 1;
        const result = assembleInventoryEconomicDiagnosis(range, rows);
        expect(result.gl).toMatchObject({
            openingBalance: 1000,
            periodDebit: 500,
            periodCredit: 300,
            closingBalance: 1200,
            rollforwardGap: 0,
        });
        expect(result.findings).toContainEqual(expect.objectContaining({
            code: 'OPENING_INVENTORY_UNAVAILABLE',
            amountBasis: 'none',
        }));
        expect(result.coverage.completenessReasons.join(' ')).toMatch(/OPENING_AND_CROSS_PERIOD/);
    });

    it('preserves full aggregate and stable first 20 samples when a cohort is truncated', () => {
        const rows = completeRows();
        const samples = Array.from({ length: 22 }, (_, index) =>
            sample('source-' + String(index).padStart(2, '0'), String(22 - index)),
        );
        rows.movements = payload(
            (rows.movements[0].payload as { metrics: Record<string, string | number> }).metrics,
            [{
                ...finding('INVENTORY_MOVEMENT_WITHOUT_JOURNAL', 'persisted_movement_value', '253'),
                count: 22,
                materiality: '22',
                samples,
            }],
        );
        const result = assembleInventoryEconomicDiagnosis(range, rows);
        const findingResult = result.findings.find((row) => row.code === 'INVENTORY_MOVEMENT_WITHOUT_JOURNAL');
        expect(findingResult).toMatchObject({ count: 22, amount: 253 });
        expect(findingResult?.samples).toHaveLength(20);
        expect(findingResult?.samples[0].sourceId).toBe('source-00');
        expect(result.coverage.dimensions).toContainEqual(expect.objectContaining({
            code: 'BOUNDED_SAMPLES',
            status: 'partial',
        }));
    });
});
