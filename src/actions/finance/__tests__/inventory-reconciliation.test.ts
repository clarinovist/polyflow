import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthorizationError } from '@/lib/errors/errors';
const m = vi.hoisted(() => ({ read: vi.fn(), tenant: vi.fn(), db: vi.fn(), list: vi.fn(), inspect: vi.fn() }));
vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/core/prisma', () => ({ getTenantDbFromContext: m.db, getTenantIdFromContext: m.tenant }));
vi.mock('@/lib/auth/finance-access', () => ({ requireFinanceAccess: m.read }));
vi.mock('@/services/inventory/reconciliation-diagnosis-service', () => ({ listReconciliationCatalog: m.list, inspectInventoryReconciliation: m.inspect }));
import { listInventoryReconciliation, inspectInventoryReconciliationAction } from '../inventory-reconciliation';
const db = { scoped: true };
beforeEach(() => { vi.resetAllMocks(); m.db.mockReturnValue(db); m.tenant.mockReturnValue('tenant-context'); m.read.mockResolvedValue({ user: { role: 'FINANCE' } }); m.list.mockResolvedValue({ items: [], page: 1, hasMore: false }); m.inspect.mockResolvedValue({ variant: { id: 'sku' } }); });

describe('Finance ATK diagnosis action boundary', () => {
    it('authorizes before read and derives database from server context', async () => {
        expect(await listInventoryReconciliation({ query: ' TEST ', page: 1 })).toMatchObject({ success: true });
        expect(m.list).toHaveBeenCalledWith(db, 'TEST', 1);
        expect(await inspectInventoryReconciliationAction({ variantId: 'sku' })).toMatchObject({ success: true });
        expect(m.inspect).toHaveBeenCalledWith(db, 'sku');
        expect(m.read).toHaveBeenCalledTimes(2);
    });
    it.each([{ database: 'other' }, { tenantId: 'other' }, { amount: 20 }, { page: 0 }, { page: 1.1 }, { query: 'x'.repeat(101) }])('rejects invalid catalog input %j', async input => {
        expect(await listInventoryReconciliation(input)).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
        expect(m.list).not.toHaveBeenCalled();
    });
    it.each([{}, { variantId: '' }, { variantId: 'sku', tenantId: 'other' }, { variantId: 'sku', apply: true }])('rejects unsupported inspection fields %j', async input => {
        expect(await inspectInventoryReconciliationAction(input)).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
        expect(m.inspect).not.toHaveBeenCalled();
    });
    it('denies non-Finance before queries and never falls back to main DB', async () => {
        m.read.mockRejectedValue(new AuthorizationError());
        expect(await listInventoryReconciliation({})).toMatchObject({ success: false, code: 'AUTHORIZATION_ERROR' });
        expect(await inspectInventoryReconciliationAction({ variantId: 'sku' })).toMatchObject({ success: false, code: 'AUTHORIZATION_ERROR' });
        expect(m.db).not.toHaveBeenCalled(); expect(m.inspect).not.toHaveBeenCalled();
        m.read.mockResolvedValue({ user: { role: 'ADMIN' } }); m.tenant.mockReturnValue(undefined);
        expect(await listInventoryReconciliation({})).toMatchObject({ success: false, code: 'AUTHORIZATION_ERROR' });
        m.tenant.mockReturnValue('tenant-context'); m.db.mockReturnValue(undefined);
        expect(await inspectInventoryReconciliationAction({ variantId: 'sku' })).toMatchObject({ success: false, code: 'AUTHORIZATION_ERROR' });
        expect(m.list).not.toHaveBeenCalled();
    });
});
