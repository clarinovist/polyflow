import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { BusinessRuleError } from '@/lib/errors/errors';
import { checkInternalUsageReadiness } from '../internal-usage-readiness';
const m = vi.hoisted(() => ({ exec: vi.fn(), variant: vi.fn(), location: vi.fn(), inventory: vi.fn(), reserved: vi.fn(), accounts: vi.fn(), resolve: vi.fn(), select: vi.fn(), assert: vi.fn(), basis: vi.fn() }));
vi.mock('@/lib/core/prisma', () => ({ prisma: { $transaction: (fn: (tx: unknown) => unknown) => fn({
    $executeRaw: m.exec, productVariant: { findUnique: m.variant }, location: { findUnique: m.location }, inventory: { findUnique: m.inventory },
    stockReservation: { aggregate: m.reserved }, account: { findMany: m.accounts },
}) } }));
vi.mock('../internal-usage-accounting', async (original) => ({
    ...await original<typeof import('../internal-usage-accounting')>(),
    resolveInternalUsageAccounts: m.resolve, selectInternalUsageInventory: m.select, assertInternalUsageAccounting: m.assert, skuInventoryBasis: m.basis,
}));
const d = (value: number) => new Prisma.Decimal(value);
const input = { productVariantId: 'book', locationId: 'office', quantity: 2 };
const packaging = { id: 'packaging', code: '1-131', name: 'Packaging stock' };
const office = { id: 'office-expense', code: '6-012', name: 'Office supplies' };
const check = (includeAccounting = false) => checkInternalUsageReadiness(input, { includeAccounting });
beforeEach(() => {
    vi.resetAllMocks();
    m.variant.mockResolvedValue({ id: 'book', archivedAt: null, product: { productType: 'OPERATIONAL', inventoryAccountId: null } });
    m.location.mockResolvedValue({ id: 'office', locationType: 'INTERNAL', packagingOwnerCustomerId: null });
    m.inventory.mockResolvedValue({ quantity: d(10), averageCost: d(4000) }); m.reserved.mockResolvedValue({ _sum: { quantity: null } });
    m.resolve.mockResolvedValue({ inventory: 'raw', expense: 'office-expense' }); m.select.mockResolvedValue('packaging');
    m.assert.mockResolvedValue({ inventory: packaging, expense: office, basis: d(40000), balance: d(150000) });
    m.basis.mockResolvedValue(new Map([['packaging', d(40000)], ['raw', d(0)]])); m.accounts.mockResolvedValue([packaging, { id: 'raw', code: '1-130', name: 'Raw stock' }]);
});
describe('internal usage readiness preflight', () => {
    it('checks the same rules read-only, without locks, before goods are handed over', async () => {
        expect(await check()).toEqual({ ready: true, message: expect.stringContaining('siap') });
        expect(m.exec.mock.calls[0][0].join('')).toContain('READ ONLY');
        expect(m.select).toHaveBeenCalledWith(expect.anything(), 'book', 'raw', d(8000), false);
        expect(m.assert).toHaveBeenCalledWith(expect.anything(), 'book', { inventory: 'packaging', expense: 'office-expense' }, d(8000), { lock: false });
    });
    it('shows account and value detail only to Finance', async () => {
        expect(await check(true)).toMatchObject({ ready: true, accounting: {
            amount: 8000, inventoryAccount: { code: '1-131' }, expenseAccount: { code: '6-012' }, glBalance: 150000,
            basis: [{ code: '1-130', name: 'Raw stock', value: 0 }, { code: '1-131', name: 'Packaging stock', value: 40000 }],
        } });
        expect(await check(false)).not.toHaveProperty('accounting');
    });
    it('reports the exact readiness cause, with SKU basis for Finance only', async () => {
        m.select.mockRejectedValue(new BusinessRuleError('terpecah', undefined, 'INTERNAL_USAGE_SOURCE_ACCOUNT_MISMATCH'));
        expect(await check()).toEqual({ ready: false, code: 'INTERNAL_USAGE_SOURCE_ACCOUNT_MISMATCH', message: 'terpecah' });
        expect(await check(true)).toMatchObject({ ready: false, accounting: { amount: 8000, basis: expect.arrayContaining([expect.objectContaining({ code: '1-131', value: 40000 })]) } });
        m.inventory.mockResolvedValue({ quantity: d(10), averageCost: null });
        expect(await check()).toMatchObject({ ready: false, code: 'INTERNAL_USAGE_MISSING_COST' });
        expect(await check(true)).toMatchObject({ ready: false, accounting: { basis: expect.any(Array) } });
        expect((await check(true)).accounting).not.toHaveProperty('amount');
    });
    it('rejects stale item, custody or availability before accounting', async () => {
        m.variant.mockResolvedValue({ id: 'book', archivedAt: new Date(), product: { productType: 'OPERATIONAL' } });
        expect(await check()).toMatchObject({ ready: false, message: expect.stringContaining('Barang Operasional') });
        m.variant.mockResolvedValue({ id: 'book', archivedAt: null, product: { productType: 'OPERATIONAL', inventoryAccountId: null } });
        m.location.mockResolvedValue({ id: 'office', locationType: 'INTERNAL', packagingOwnerCustomerId: 'customer' });
        expect(await check()).toMatchObject({ ready: false, message: expect.stringContaining('lokasi internal') });
        m.location.mockResolvedValue({ id: 'office', locationType: 'INTERNAL', packagingOwnerCustomerId: null });
        m.reserved.mockResolvedValue({ _sum: { quantity: d(9) } });
        expect(await check()).toMatchObject({ ready: false, message: expect.stringContaining('Stok tersedia') });
        m.inventory.mockResolvedValue(null);
        expect(await check()).toMatchObject({ ready: false, message: expect.stringContaining('Stok tersedia') });
        expect(m.resolve).not.toHaveBeenCalled();
    });
    it('validates input and propagates unexpected failures', async () => {
        await expect(checkInternalUsageReadiness({ ...input, quantity: 0 }, { includeAccounting: false })).rejects.toThrow('nol');
        m.assert.mockRejectedValue(new Error('connection lost'));
        await expect(check()).rejects.toThrow('connection lost');
    });
});
