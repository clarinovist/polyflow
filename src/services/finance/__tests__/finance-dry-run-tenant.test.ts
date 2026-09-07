import { AsyncLocalStorage } from 'node:async_hooks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';

vi.mock('@/lib/core/prisma', async () => {
    const { AsyncLocalStorage } = await import('node:async_hooks');
    return { getMainPrisma: vi.fn(), getTenantDb: vi.fn(), tenantContext: new AsyncLocalStorage(), tenantIdContext: new AsyncLocalStorage() };
});
import { getMainPrisma, getTenantDb, tenantContext, tenantIdContext } from '@/lib/core/prisma';
import { withFinanceDryRunTenant, requireFinanceDryRunSnapshot } from '../finance-dry-run-tenant';

const target = { tenantId: 'tenant-a', subdomain: 'fixture-a', databaseName: 'polyflow_recognition_test' };
const record = { id: target.tenantId, subdomain: target.subdomain, status: 'ACTIVE', dbUrl: 'postgresql://127.0.0.1:1/polyflow_recognition_test' };
const tenantRead = vi.fn();
const moduleRead = vi.fn();
const mainRaw = vi.fn();
const tenantRaw = vi.fn();
const execute = vi.fn();
const mainTx = { tenant: { findUnique: tenantRead }, tenantModule: { findFirst: moduleRead }, $queryRaw: mainRaw, $executeRaw: execute };
const tx = { $queryRaw: tenantRaw, $executeRaw: execute };
const mainTransaction = vi.fn(async (fn: (client: typeof mainTx) => unknown) => fn(mainTx));
const tenantTransaction = vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx));

beforeEach(() => {
    vi.clearAllMocks();
    tenantRead.mockResolvedValue(record);
    moduleRead.mockResolvedValue({ id: 'finance' });
    mainRaw.mockResolvedValue([{ databaseName: 'polyflow_registry_test' }]);
    tenantRaw.mockResolvedValue([{ databaseName: target.databaseName, readOnly: 'on', isolation: 'repeatable read' }]);
    vi.mocked(getMainPrisma).mockReturnValue({ $transaction: mainTransaction } as unknown as PrismaClient);
    vi.mocked(getTenantDb).mockReturnValue({ $transaction: tenantTransaction } as unknown as PrismaClient);
});

describe('manual finance dry-run tenant boundary', () => {
    it('requires its verified live snapshot, not just a supplied tenant id', () => {
        expect(() => requireFinanceDryRunSnapshot()).toThrow(/tenant|snapshot/i);
        expect(() => tenantContext.run(tx as unknown as PrismaClient, () => tenantIdContext.run(target.tenantId, requireFinanceDryRunSnapshot))).toThrow(/snapshot/i);
    });
    it('keeps matching ALS alive across awaits and returns only safe identity', async () => {
        const result = await withFinanceDryRunTenant(target, async () => {
            await Promise.resolve();
            const context = requireFinanceDryRunSnapshot();
            expect(await context.tx.$queryRaw`SELECT 1`).toEqual([{ databaseName: target.databaseName, readOnly: 'on', isolation: 'repeatable read' }]);
            expect(tenantContext.getStore()).toBe(context.tx);
            expect(tenantIdContext.getStore()).toBe(target.tenantId);
            return context.tenant;
        });
        expect(result).toEqual(target);
        expect(JSON.stringify(result)).not.toContain('postgresql');
        expect(tenantContext.getStore()).toBeUndefined();
        expect(execute.mock.calls.every(call => call[0].join('').includes('SET TRANSACTION READ ONLY'))).toBe(true);
        expect(tenantTransaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: 'RepeatableRead' }));
    });
    it.each([null, {}, { ...target, unexpected: true }, { ...target, subdomain: '' }])('rejects invalid target before DB', async value => {
        await expect(withFinanceDryRunTenant(value, async () => null)).rejects.toThrow();
        expect(getMainPrisma).not.toHaveBeenCalled();
    });
    it.each([null, { ...record, status: 'SUSPENDED' }, { ...record, id: 'other' }, { ...record, dbUrl: '' }, { ...record, dbUrl: 'https://invalid' }])('rejects missing/inactive/mismatched registry', async value => {
        tenantRead.mockResolvedValueOnce(value);
        await expect(withFinanceDryRunTenant(target, async () => null)).rejects.toThrow(/verifikasi/i);
        expect(getTenantDb).not.toHaveBeenCalled();
    });
    it('requires current FINANCE entitlement', async () => {
        moduleRead.mockResolvedValueOnce(null);
        await expect(withFinanceDryRunTenant(target, async () => null)).rejects.toThrow(/verifikasi/i);
        expect(moduleRead).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: target.tenantId, moduleKey: 'FINANCE', status: 'ACTIVE' }) }));
        expect(getTenantDb).not.toHaveBeenCalled();
    });
    it('refuses the main database even if registry points to it', async () => {
        mainRaw.mockResolvedValueOnce([{ databaseName: target.databaseName }]);
        await expect(withFinanceDryRunTenant(target, async () => null)).rejects.toThrow(/verifikasi/i);
        expect(getTenantDb).not.toHaveBeenCalled();
    });
    it.each([
        { databaseName: 'wrong', readOnly: 'on', isolation: 'repeatable read' },
        { databaseName: target.databaseName, readOnly: 'off', isolation: 'repeatable read' },
        { databaseName: target.databaseName, readOnly: 'on', isolation: 'read committed' },
    ])('refuses an unverified database snapshot', async state => {
        tenantRaw.mockResolvedValueOnce([state]);
        const inspect = vi.fn();
        await expect(withFinanceDryRunTenant(target, inspect)).rejects.toThrow(/verifikasi/i);
        expect(inspect).not.toHaveBeenCalled();
    });
    it('detects mismatched ambient context inside a snapshot', async () => {
        await expect(withFinanceDryRunTenant(target, async () => tenantIdContext.run('other', requireFinanceDryRunSnapshot))).rejects.toThrow(/verifikasi/i);
    });
    it('rejects entry with an already bound tenant rather than switching it', async () => {
        await expect(tenantIdContext.run('other', () => withFinanceDryRunTenant(target, async () => null))).rejects.toThrow(/tenant/i);
        expect(getMainPrisma).not.toHaveBeenCalled();
    });
    it('sanitizes callback and connection errors', async () => {
        await expect(withFinanceDryRunTenant(target, async () => { throw new Error('private connection details'); })).rejects.toThrow(/^Pemeriksaan dry-run gagal diverifikasi\.$/);
        mainTransaction.mockRejectedValueOnce(new Error('private SQL'));
        await expect(withFinanceDryRunTenant(target, async () => null)).rejects.toThrow(/^Pemeriksaan dry-run gagal diverifikasi\.$/);
    });
    it('is independent of unrelated async context', async () => {
        const unrelated = new AsyncLocalStorage<string>();
        expect(await unrelated.run('other', () => withFinanceDryRunTenant(target, async () => requireFinanceDryRunSnapshot().tenant.tenantId))).toBe(target.tenantId);
    });
});
