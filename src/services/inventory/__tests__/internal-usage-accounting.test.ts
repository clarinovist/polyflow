import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import {
    INTERNAL_USAGE_READINESS as CODE,
    assertInternalUsageAccounting,
    internalUsageAmount,
    resolveInternalUsageAccounts,
    selectInternalUsageInventory,
} from '../internal-usage-accounting';
const m = vi.hoisted(() => ({ tenant: vi.fn(), mapping: vi.fn(), resolve: vi.fn(), basis: vi.fn(), locks: vi.fn(), accounts: vi.fn(), sum: vi.fn() }));
vi.mock('@/lib/core/prisma', () => ({ getTenantIdFromContext: m.tenant, getMainPrisma: () => ({ tenantAccountRole: { findUnique: m.mapping } }) }));
vi.mock('@/services/accounting/account-mapping-policy', () => ({ resolveAccountCode: m.resolve }));
const inventory = { id: 'inv', code: '1-131', name: 'Packaging', type: 'ASSET', category: 'CURRENT_ASSET', isActive: true, currency: 'IDR', isCashAccount: false };
const expense = { id: 'exp', code: '6-012', name: 'Office', type: 'EXPENSE', category: 'OPERATING_EXPENSE', isActive: true, currency: 'IDR' };
const raw = (strings: TemplateStringsArray) => (strings.join('?').includes('FOR UPDATE') ? m.locks() : m.basis());
const tx = { $queryRaw: vi.fn(raw), account: { findMany: m.accounts }, journalLine: { aggregate: m.sum } } as unknown as Prisma.TransactionClient;
const ids = { inventory: 'inv', expense: 'exp' };
const d = (value: number | string) => new Prisma.Decimal(value);
const run = (options?: { lock: boolean }) => assertInternalUsageAccounting(tx, 'pen', ids, d(6000), options);
const select = (isOverride = false) => selectInternalUsageInventory(tx, 'pen', 'inv', d(6000), isOverride);
beforeEach(() => {
    vi.clearAllMocks(); m.tenant.mockReturnValue('tenant'); m.mapping.mockResolvedValue({ accountId: 'exp' }); m.resolve.mockResolvedValue({ id: 'inv' });
    m.accounts.mockResolvedValue([inventory, expense]); m.basis.mockResolvedValue([{ accountId: 'inv', value: d(48000) }]); m.locks.mockResolvedValue([]);
    m.sum.mockResolvedValue({ _sum: { debit: d(48000), credit: d(0) } });
});
describe('internal usage accounting proof', () => {
    it('requires explicit tenant Finance mapping, preserving receipt inventory resolution', async () => {
        expect(await resolveInternalUsageAccounts(null)).toEqual(ids);
        expect(m.resolve).toHaveBeenCalledWith('OPERATIONAL', 'inventory');
        expect(await resolveInternalUsageAccounts('override')).toEqual({ inventory: 'override', expense: 'exp' });
        m.mapping.mockResolvedValue(null);
        await expect(resolveInternalUsageAccounts(null)).rejects.toMatchObject({ code: CODE.MISSING_MAPPING, message: expect.stringContaining('Finance') });
        m.tenant.mockReturnValue(null); await expect(resolveInternalUsageAccounts(null)).rejects.toThrow('Tenant');
    });
    it('values usage from the location WAC and never from a missing cost', () => {
        expect(internalUsageAmount(d(4000), 2).toString()).toBe('8000');
        expect(internalUsageAmount(d('1333.3333'), 3).toString()).toBe('4000');
        for (const cost of [null, undefined, d(0), d(-1)]) expect(() => internalUsageAmount(cost, 2)).toThrow(expect.objectContaining({ code: CODE.MISSING_COST }));
        expect(() => internalUsageAmount(d('9999999999999'), 2)).toThrow('batas');
    });
    it('accepts sufficient posted SKU proof and inventory GL, locking only when posting', async () => {
        await expect(run()).resolves.toMatchObject({ basis: d(48000), balance: d(48000), inventory: { code: '1-131' }, expense: { code: '6-012' } });
        expect(m.locks).toHaveBeenCalledTimes(1);
        await run({ lock: false }); expect(m.locks).toHaveBeenCalledTimes(1);
    });
    it.each([
        { ...inventory, type: 'EXPENSE' }, { ...inventory, isActive: false }, { ...inventory, category: 'FIXED_ASSET' },
        { ...inventory, currency: 'USD' }, { ...inventory, isCashAccount: true },
    ])('rejects incompatible inventory account %#', async (account) => {
        m.accounts.mockResolvedValue([account, expense]);
        await expect(run()).rejects.toMatchObject({ code: CODE.MISSING_MAPPING, message: expect.stringContaining('Akun persediaan') });
    });
    it.each([{ ...expense, category: 'COGS' }, { ...expense, type: 'ASSET' }, { ...expense, isActive: false }, { ...expense, currency: 'USD' }])('rejects incompatible expense %#', async (account) => {
        m.accounts.mockResolvedValue([inventory, account]);
        await expect(run()).rejects.toMatchObject({ code: CODE.MISSING_MAPPING, message: expect.stringContaining('beban operasional') });
    });
    it('separates missing SKU capital from an insufficient inventory GL', async () => {
        m.basis.mockResolvedValue([]);
        await expect(run()).rejects.toMatchObject({ code: CODE.MISSING_SOURCE_BASIS, message: expect.stringContaining('tertaut') });
        m.basis.mockResolvedValue([{ accountId: 'inv', value: d(5999) }]);
        await expect(run()).rejects.toMatchObject({ code: CODE.MISSING_SOURCE_BASIS });
        m.basis.mockResolvedValue([{ accountId: 'other', value: d(48000) }]);
        await expect(run()).rejects.toMatchObject({ code: CODE.MISSING_SOURCE_BASIS });
        m.basis.mockResolvedValue([{ accountId: 'inv', value: d(48000) }]); m.sum.mockResolvedValue({ _sum: { debit: null, credit: d(1) } });
        await expect(run()).rejects.toMatchObject({ code: CODE.INSUFFICIENT_GL, message: expect.stringContaining('Saldo') });
    });
});
describe('inventory account follows the SKU capitalization source', () => {
    it('keeps the resolved account whenever it holds enough SKU basis', async () => {
        m.basis.mockResolvedValue([{ accountId: 'inv', value: d(6000) }, { accountId: 'other', value: d(90000) }]);
        expect(await select()).toBe('inv');
    });
    it('credits the single other account that capitalized this SKU', async () => {
        m.basis.mockResolvedValue([{ accountId: 'inv', value: d(0) }, { accountId: 'packaging', value: d(40000) }, { accountId: 'stale', value: d(-1200) }]);
        expect(await select()).toBe('packaging');
    });
    it('keeps a product override strict instead of searching other accounts', async () => {
        m.basis.mockResolvedValue([{ accountId: 'packaging', value: d(40000) }]);
        expect(await select(true)).toBe('inv'); expect(m.basis).not.toHaveBeenCalled();
    });
    it('rejects SKUs without any attributable receipt basis', async () => {
        m.basis.mockResolvedValue([{ accountId: 'stale', value: d(-1200) }]);
        await expect(select()).rejects.toMatchObject({ code: CODE.MISSING_SOURCE_BASIS });
    });
    it('rejects split or ambiguous basis instead of choosing by balance', async () => {
        m.basis.mockResolvedValue([{ accountId: 'inv', value: d(3000) }, { accountId: 'packaging', value: d(3000) }]);
        await expect(select()).rejects.toMatchObject({ code: CODE.SOURCE_ACCOUNT_MISMATCH, message: expect.stringContaining('akun persediaan') });
        m.basis.mockResolvedValue([{ accountId: 'raw', value: d(9000) }, { accountId: 'packaging', value: d(9000) }]);
        await expect(select()).rejects.toMatchObject({ code: CODE.SOURCE_ACCOUNT_MISMATCH });
    });
});
