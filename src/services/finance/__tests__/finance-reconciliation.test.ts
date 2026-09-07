import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
vi.mock('@/services/accounting/reports-service', () => ({ getIncomeStatement: vi.fn() }));
import { getIncomeStatement } from '@/services/accounting/reports-service';
import { reconcileFinance } from '../finance-reconciliation-service';
const report = { revenue: [], cogs: [], opex: [], other: [], totalRevenue: 1000, totalManufacturingCosts: 300, inventoryChange: 0, totalCOGS: 300, grossProfit: 700, totalOpEx: 50, operatingIncome: 650, totalOther: -10, netIncome: 640 };
const query = vi.fn();
const tx = { $queryRaw: query } as unknown as Prisma.TransactionClient;
beforeEach(() => { vi.clearAllMocks(); vi.mocked(getIncomeStatement).mockResolvedValue(report); });
describe('finance reconciliation', () => {
    it('uses the existing report and explicit snapshot client with WIB bounds', async () => {
        query.mockResolvedValueOnce([{ id: 'j', net: new Prisma.Decimal(300), totalCount: BigInt(1), totalNet: new Prisma.Decimal(300) }]).mockResolvedValueOnce([]);
        const result = await reconcileFinance(tx, { startDate: '2026-08-01', endDate: '2026-08-31' });
        expect(getIncomeStatement).toHaveBeenCalledWith(new Date('2026-07-31T17:00:00Z'), new Date('2026-08-31T16:59:59.999Z'), tx);
        expect(result.report).toBe(report);
        expect(result.cogs).toMatchObject({ count: 1, total: 300, truncated: false });
        expect(result.cogsDifference).toBe(0);
        expect(result.invoices).toMatchObject({ count: 0, total: 0 });
    });
    it('keeps total/count from aggregate window, not top-N rows', async () => {
        query.mockResolvedValueOnce([{ id: 'adjustment', net: new Prisma.Decimal(-100), totalCount: BigInt(30), totalNet: new Prisma.Decimal(250) }]).mockResolvedValueOnce([{ id: 'invoice', totalAmount: new Prisma.Decimal(500), totalCount: BigInt(50), totalValue: new Prisma.Decimal(10000) }]);
        const result = await reconcileFinance(tx, { startDate: '2026-08-01', endDate: '2026-08-31' });
        expect(result.cogs).toMatchObject({ count: 30, total: 250, truncated: true });
        expect(result.invoices).toMatchObject({ count: 50, total: 10000, truncated: true });
        expect(result.cogsDifference).toBe(50);
    });
    it('handles empty results and propagates SQL failures', async () => {
        query.mockResolvedValue([]);
        expect((await reconcileFinance(tx, { startDate: '2026-08-01', endDate: '2026-08-01' })).cogs.count).toBe(0);
        query.mockRejectedValueOnce(new Error('DB unavailable'));
        await expect(reconcileFinance(tx, { startDate: '2026-08-01', endDate: '2026-08-01' })).rejects.toThrow('DB unavailable');
    });
    it.each([['2026-02-30', '2026-03-01'], ['2026-09-02', '2026-09-01'], ['2025-01-01', '2026-01-02']])('rejects invalid service-boundary date range', async (startDate, endDate) => {
        await expect(reconcileFinance(tx, { startDate, endDate })).rejects.toThrow();
        expect(query).not.toHaveBeenCalled(); expect(getIncomeStatement).not.toHaveBeenCalled();
    });
});
