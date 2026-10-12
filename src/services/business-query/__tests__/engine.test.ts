import { describe, expect, it, vi } from 'vitest';
vi.mock('../finance-ledger-query', async (importOriginal) => {
    const original = await importOriginal<typeof import('../finance-ledger-query')>();
    return { ...original, queryFinanceLedger: vi.fn().mockResolvedValue({ dataset: 'ledger_lines' }) };
});
import { queryFinanceLedger } from '../finance-ledger-query';
import { BUSINESS_DATASET_CATALOG, executeBusinessQuery, getBusinessDataset } from '../engine';

describe('business query engine catalog', () => {
    it('registers deterministic finance datasets with permission and metric policy', () => {
        expect(BUSINESS_DATASET_CATALOG.map((item) => item.id)).toEqual([
            'finance.ledger_lines',
            'finance.ledger_expenses',
        ]);
        expect(getBusinessDataset('ledger_expenses')).toMatchObject({
            metric: 'net_expense',
            requiredResource: '/finance/reports/general-ledger',
            statusPolicy: 'POSTED',
            maxRangeDays: 366,
        });
    });

    it('validates input before dispatching to the registered executor', async () => {
        await executeBusinessQuery({ dataset: 'ledger_lines', keywords: ['solar'] });
        expect(queryFinanceLedger).toHaveBeenCalledWith(
            expect.objectContaining({ dataset: 'ledger_lines', keywords: ['solar'] }),
            {},
        );
        await expect(
            executeBusinessQuery({ dataset: 'ledger_lines', keywords: ['solar'], sql: 'select 1' } as never),
        ).rejects.toThrow();
    });
});
