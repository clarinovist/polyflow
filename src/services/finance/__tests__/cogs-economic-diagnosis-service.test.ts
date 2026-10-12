import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import {
    assembleCogsEconomicDiagnosis,
    diagnoseCogsEconomicCompleteness,
} from '../cogs-economic-diagnosis-service';

const range = {
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    start: new Date('2026-07-31T17:00:00.000Z'),
    end: new Date('2026-08-31T16:59:59.999Z'),
};
const finding = (
    code: string,
    area: 'shipment' | 'return' | 'production',
    amount: string,
    sourceId = `${area}-1`,
) => ({
    code,
    area,
    amountBasis: area === 'return' ? 'commercial_credit_value' : 'posted_inventory_wip_journal',
    count: 1,
    amount,
    materiality: amount,
    reason: `${code} confirmed`,
    evidenceLimit: 'Accounting implication needs review.',
    samples: [{ sourceId, materiality: amount, amount, reason: 'sample' }],
});
const payload = (metrics: Record<string, string | number>, findings: unknown[] = []) => [
    { payload: { metrics, findings } },
];

function completeRows() {
    return {
        shipments: payload({
            cohortCount: 3,
            activeCount: 2,
            coveredCount: 1,
            reversedCount: 1,
            offBalanceCount: 0,
            quantity: '5',
            nominalRevenue: '1000',
            postedCogs: '600',
            explicitMovementValue: '600',
            explicitMovementKnownCount: 2,
            historicalFallbackUnknownCount: 0,
            legacyAttributionCount: 0,
            incompleteSalesValue: '0',
        }),
        returns: payload({
            cohortCount: 1,
            physicalInRangeCount: 1,
            completedInRangeCount: 1,
            goodReceiptCount: 1,
            damagedReceiptCount: 0,
            physicalRestockValue: '120',
            activeCommercialCreditValue: '200',
            originalPostedRevenue: '1000',
            completedWithoutActiveCreditCount: 0,
            crossPeriodCount: 0,
            unresolvedPhysicalVectorCount: 0,
            unresolvedCommercialVectorCount: 0,
        }),
        production: payload({
            issueCount: 1,
            issueQuantity: '2',
            issueMovementValue: '400',
            issueJournalValue: '450',
            outputCount: 1,
            outputQuantity: '1',
            outputMovementValue: '500',
            outputJournalValue: '500',
            scrapCount: 0,
            returnInCount: 0,
            maklonCount: 0,
            semanticRoleUnknownCount: 0,
            ambiguousReversalCount: 0,
            legacyUniqueReversalCount: 0,
            outputIssueOutsideCount: 0,
            issueOutputOutsideCount: 0,
            shipmentCount: 0,
            shipmentJournalValue: '0',
            unattributedShipmentCount: 0,
            adjustmentCount: 0,
        }),
    };
}

async function diagnosisSql() {
    const query = vi.fn()
        .mockResolvedValueOnce([{ total: new Prisma.Decimal(0) }])
        .mockResolvedValueOnce(completeRows().shipments)
        .mockResolvedValueOnce(completeRows().returns)
        .mockResolvedValueOnce(completeRows().production);
    await diagnoseCogsEconomicCompleteness(
        { $queryRaw: query, account: { findMany: vi.fn().mockResolvedValue([]) } } as unknown as Prisma.TransactionClient,
        { startDate: range.startDate, endDate: range.endDate },
    );
    return query.mock.calls.map(call => call[0].strings.join(' ')).join('\n');
}

describe('COGS economic diagnosis contract', () => {
    it.each([
        ['valid shipment journal vector', ['SHIPMENT_COVERED_COGS', 'postedAutoJournals', 'cogsDebit', 'assetCredit']],
        ['missing and zero shipment valuation', ['SHIPMENT_JOURNAL_MISSING', 'ZERO_VALUED_SALES_SHIPMENT']],
        ['shipment debit outside COGS', ['SHIPMENT_COST_OUTSIDE_COGS', "a.category = 'COGS'"]],
        ['explicit shipment cost mismatch', ['SHIPMENT_EXPLICIT_COST_MISMATCH', 'cost * quantity']],
        ['exact shipment reversal', ['SHIPMENT_REVERSAL_EXCLUDED', '[SOURCE:']],
        ['Maklon shipment exclusion', ['SHIPMENT_OFF_BALANCE_EXCLUDED', 'MAKLON_JASA']],
        ['aggregate before stable sample limit', ['ROW_NUMBER() OVER', 'materiality DESC', 'FILTER (WHERE rn <=']],
        ['WIB bounds and closing exclusion', ['m."createdAt" >=', 'm."createdAt" <=', 'NOT LIKE']],
        ['GOOD physical cost reversal', ['RETURN_GOOD_COST_REVERSAL_MISSING', 'historical_restock_value']],
        ['DAMAGED intentional no-restock', ['RETURN_DAMAGED_NO_RESTOCK_EXPECTED', "i.condition = 'DAMAGED'"]],
        ['completed return without active credit', ['COMPLETED_RETURN_WITHOUT_COMMERCIAL_CREDIT', 'COGS_REVERSAL_WITHOUT_COMMERCIAL_REVERSAL', "status = 'COMPLETED'"]],
        ['active and reversed SalesReturnCredit', ['SalesReturnCredit', 'RETURN_ACTIVE_CREDIT_JOURNAL_INVALID', 'RETURN_CREDIT_REVERSED_HISTORY']],
        ['active and reversed CustomerCreditNote', ['CustomerCreditNote', 'noteReversalJournalStatus', 'RETURN_CREDIT_REVERSAL_JOURNAL_INVALID']],
        ['physical and commercial cross-period', ['RETURN_COMMERCIAL_CREDIT_CROSS_PERIOD', 'crossPeriodCount']],
        ['production issue and output journal vectors', ['PRODUCTION_ISSUE_JOURNAL_INVALID', 'PRODUCTION_OUTPUT_JOURNAL_INVALID', 'wipDebit', 'inventoryDebit']],
        ['null issue movement value with positive GL', ['PRODUCTION_ISSUE_GL_WITHOUT_MOVEMENT_VALUE']],
        ['zero production output', ['PRODUCTION_OUTPUT_ZERO_VALUE']],
        ['production reversal pairing', ['legacy_ambiguous', 'legacy_unique', 'markerId', 'pairedSourceId']],
        ['scrap side flow', ['PRODUCTION_SCRAP_SIDE_FLOW']],
        ['production adjustment side flow', ['PRODUCTION_ADJUSTMENT_SIDE_FLOW', 'INVENTORY_ADJUSTMENT_OUTSIDE_COGS']],
        ['production Maklon exclusion and opening cross-period', ['PRODUCTION_MAKLON_OFF_BALANCE_EXCLUDED', 'PRODUCTION_OUTPUT_WITH_ISSUE_OUTSIDE_RANGE', 'PRODUCTION_ISSUE_WITH_OUTPUT_OUTSIDE_RANGE']],
        ['unattributed shipment aggregate bridge', ['COST_FLOW_UNATTRIBUTED', 'aggregate-shipments']],
    ] as const)('encodes scenario: %s', async (_scenario, tokens) => {
        const sql = await diagnosisSql();
        for (const token of tokens) expect(sql).toContain(token);
    });

    it('keeps movement, GL, return and commercial bases separate while sorting material findings', () => {
        const rows = completeRows();
        rows.shipments = payload(
            (rows.shipments[0].payload as { metrics: Record<string, string | number> }).metrics,
            [
                finding('SHIPMENT_EXPLICIT_COST_MISMATCH', 'shipment', '50', 's-small'),
                finding('SHIPMENT_JOURNAL_MISSING', 'shipment', '600', 's-big'),
            ],
        );
        rows.returns = payload(
            (rows.returns[0].payload as { metrics: Record<string, string | number> }).metrics,
            [finding('RETURN_COMPLETED_NO_ACTIVE_CREDIT', 'return', '200', 'r-1')],
        );
        rows.production = payload(
            (rows.production[0].payload as { metrics: Record<string, string | number> }).metrics,
            [finding('PRODUCTION_ISSUE_GL_WITHOUT_MOVEMENT_VALUE', 'production', '450', 'p-1')],
        );

        const result = assembleCogsEconomicDiagnosis(range, rows);
        expect(result.findings.map(row => row.code)).toEqual([
            'SHIPMENT_JOURNAL_MISSING',
            'PRODUCTION_ISSUE_GL_WITHOUT_MOVEMENT_VALUE',
            'RETURN_COMPLETED_NO_ACTIVE_CREDIT',
            'SHIPMENT_EXPLICIT_COST_MISMATCH',
        ]);
        expect(result.findings.every(row => row.conditionStatus === 'confirmed')).toBe(true);
        expect(result.findings.every(row => row.accountingConclusion === 'needs_review')).toBe(true);
        expect(result.findings[0]).toMatchObject({
            nominal: 600,
            revenuePercentage: 60,
            sourceId: 's-big',
        });
        expect(result.productionFlow.materialIssue).toMatchObject({
            movementValue: 400,
            journalValue: 450,
        });
        expect(result.returns).toMatchObject({
            physicalRestockValue: 120,
            activeCommercialCreditValue: 200,
            originalPostedRevenue: 1000,
        });
    });

    it('applies deterministic 0.60/0.75/0.85/0.90 coverage caps and gates mandatory completeness', () => {
        const covered = assembleCogsEconomicDiagnosis(range, completeRows());
        expect(covered.coverage).toMatchObject({ mandatoryComplete: false, confidenceCap: 0.85 });

        const noFlow = completeRows();
        const noFlowMetrics = (noFlow.production[0].payload as { metrics: Record<string, string | number> }).metrics;
        Object.assign(noFlowMetrics, { issueCount: 0, outputCount: 0, shipmentCount: 0 });
        expect(assembleCogsEconomicDiagnosis(range, noFlow).coverage).toMatchObject({ mandatoryComplete: true, confidenceCap: 0.9 });

        const attribution = completeRows();
        (attribution.shipments[0].payload as { metrics: Record<string, string | number> }).metrics.historicalFallbackUnknownCount = 1;
        expect(assembleCogsEconomicDiagnosis(range, attribution).coverage).toMatchObject({
            mandatoryComplete: false,
            confidenceCap: 0.75,
        });

        const sideFlow = completeRows();
        (sideFlow.production[0].payload as { metrics: Record<string, string | number> }).metrics.scrapCount = 1;
        expect(assembleCogsEconomicDiagnosis(range, sideFlow).coverage).toMatchObject({
            mandatoryComplete: false,
            confidenceCap: 0.85,
        });

        const unreadable = completeRows();
        unreadable.returns = [];
        expect(assembleCogsEconomicDiagnosis(range, unreadable).coverage).toMatchObject({
            mandatoryComplete: false,
            confidenceCap: 0.6,
        });
    });

    it('marks Maklon, scrap, adjustment, cross-period and aggregate lineage as limitations without conflating them', () => {
        const rows = completeRows();
        const productionMetrics = (rows.production[0].payload as { metrics: Record<string, string | number> }).metrics;
        Object.assign(productionMetrics, {
            maklonCount: 2,
            scrapCount: 1,
            returnInCount: 1,
            adjustmentCount: 1,
            outputIssueOutsideCount: 1,
            issueOutputOutsideCount: 1,
            shipmentCount: 4,
            shipmentJournalValue: '800',
            unattributedShipmentCount: 4,
        });
        const result = assembleCogsEconomicDiagnosis(range, rows);
        expect(result.coverage.confidenceCap).toBe(0.85);
        expect(result.productionFlow.sideFlows).toEqual({
            scrapCount: 1,
            returnInCount: 1,
            adjustmentCount: 1,
            maklonOffBalanceCount: 2,
        });
        expect(result.productionFlow.crossPeriod).toEqual({
            outputWithIssueOutsideRange: 1,
            issueWithOutputOutsideRange: 1,
        });
        expect(result.productionFlow.shipmentCogs).toMatchObject({
            count: 4,
            journalValue: 800,
            attribution: 'aggregate_only',
        });
        expect(result.limitations.join(' ')).toMatch(/lineage lot|Opening inventory/i);
    });

    it('uses only the supplied transaction client, WIB bounds, closing filters, aggregate-before-limit and stable samples', async () => {
        const query = vi.fn()
            .mockResolvedValueOnce([{ total: new Prisma.Decimal(0) }])
            .mockResolvedValueOnce(completeRows().shipments)
            .mockResolvedValueOnce(completeRows().returns)
            .mockResolvedValueOnce(completeRows().production);
        const tx = { $queryRaw: query, account: { findMany: vi.fn().mockResolvedValue([]) } } as unknown as Prisma.TransactionClient;
        const result = await diagnoseCogsEconomicCompleteness(tx, {
            startDate: range.startDate,
            endDate: range.endDate,
        });
        expect(query).toHaveBeenCalledTimes(4);
        const sql = query.mock.calls.map(call => call[0].strings.join(' ')).join('\n');
        expect(sql).toContain('m."createdAt" >=' );
        expect(sql).toContain('m."createdAt" <=' );
        expect(sql).toContain('NOT LIKE');
        expect(sql).toContain('ROW_NUMBER() OVER');
        expect(sql).toContain('ORDER BY materiality DESC');
        expect(sql).toContain('MANUAL_ENTRY');
        expect(sql).toContain('MAKLON_JASA');
        expect(sql).toContain('SALES_RETURN');
        expect(sql).toContain('CustomerCreditNote');
        expect(sql).toContain('SOURCE:');
        expect(result.range).toEqual(range);
    });

    it.each([
        ['2026-02-30', '2026-03-01'],
        ['2026-09-02', '2026-09-01'],
        ['2025-01-01', '2026-01-02'],
    ])('rejects invalid service ranges before any query: %s to %s', async (startDate, endDate) => {
        const query = vi.fn();
        await expect(
            diagnoseCogsEconomicCompleteness(
                { $queryRaw: query } as unknown as Prisma.TransactionClient,
                { startDate, endDate },
            ),
        ).rejects.toThrow();
        expect(query).not.toHaveBeenCalled();
    });
});
