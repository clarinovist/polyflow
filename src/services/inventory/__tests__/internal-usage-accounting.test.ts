import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { assertInternalUsageAccounting, resolveInternalUsageAccounts } from '../internal-usage-accounting';
const m = vi.hoisted(() => ({ tenant: vi.fn(), mapping: vi.fn(), resolve: vi.fn(), raw: vi.fn(), accounts: vi.fn(), sum: vi.fn() }));
vi.mock('@/lib/core/prisma', () => ({ getTenantIdFromContext: m.tenant, getMainPrisma: () => ({ tenantAccountRole: { findUnique: m.mapping } }) }));
vi.mock('@/services/accounting/account-mapping-policy', () => ({ resolveAccountCode: m.resolve }));
const inventory = { id: 'inv', type: 'ASSET', category: 'CURRENT_ASSET', isActive: true, currency: 'IDR', isCashAccount: false };
const expense = { id: 'exp', type: 'EXPENSE', category: 'OPERATING_EXPENSE', isActive: true, currency: 'IDR' };
const tx = { $queryRaw: m.raw, account: { findMany: m.accounts }, journalLine: { aggregate: m.sum } } as unknown as Prisma.TransactionClient;
const ids = { inventory: 'inv', expense: 'exp' };
const run = () => assertInternalUsageAccounting(tx, 'pen', ids, new Prisma.Decimal(6000));
beforeEach(() => {
    vi.resetAllMocks(); m.tenant.mockReturnValue('tenant'); m.mapping.mockResolvedValue({ accountId: 'exp' }); m.resolve.mockResolvedValue({ id: 'inv' });
    m.accounts.mockResolvedValue([inventory, expense]); m.raw.mockResolvedValue([{ value: new Prisma.Decimal(48000) }]); m.sum.mockResolvedValue({ _sum: { debit: new Prisma.Decimal(48000), credit: new Prisma.Decimal(0) } });
});
describe('internal usage accounting proof', () => {
    it('requires explicit tenant Finance mapping, preserving receipt inventory resolution', async () => {
        expect(await resolveInternalUsageAccounts(null)).toEqual(ids);
        expect(m.resolve).toHaveBeenCalledWith('OPERATIONAL', 'inventory');
        expect(await resolveInternalUsageAccounts('override')).toEqual({ inventory: 'override', expense: 'exp' });
        m.mapping.mockResolvedValue(null); await expect(resolveInternalUsageAccounts(null)).rejects.toThrow('Finance');
        m.tenant.mockReturnValue(null); await expect(resolveInternalUsageAccounts(null)).rejects.toThrow('Tenant');
    });
    it('accepts sufficient posted SKU proof and inventory GL', async () => { await expect(run()).resolves.toBeUndefined(); });
    it.each([
        { ...inventory, type: 'EXPENSE' }, { ...inventory, isActive: false }, { ...inventory, category: 'FIXED_ASSET' },
        { ...inventory, currency: 'USD' }, { ...inventory, isCashAccount: true },
    ])('rejects incompatible inventory account %#', async (account) => {
        m.accounts.mockResolvedValue([account, expense]); await expect(run()).rejects.toThrow('Akun persediaan');
    });
    it.each([{ ...expense, category: 'COGS' }, { ...expense, type: 'ASSET' }, { ...expense, isActive: false }, { ...expense, currency: 'USD' }])('rejects incompatible expense %#', async (account) => {
        m.accounts.mockResolvedValue([inventory, account]); await expect(run()).rejects.toThrow('beban operasional');
    });
    it('rejects missing or insufficient attributable SKU capital and negative GL', async () => {
        m.raw.mockResolvedValue([]); await expect(run()).rejects.toThrow('tertaut');
        m.raw.mockResolvedValue([{ value: new Prisma.Decimal(5999) }]); await expect(run()).rejects.toThrow('belum mencukupi');
        m.raw.mockResolvedValue([{ value: new Prisma.Decimal(48000) }]); m.sum.mockResolvedValue({ _sum: { debit: null, credit: new Prisma.Decimal(1) } });
        await expect(run()).rejects.toThrow('belum mencukupi');
    });
});
