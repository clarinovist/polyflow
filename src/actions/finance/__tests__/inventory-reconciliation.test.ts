import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthorizationError } from '@/lib/errors/errors';
const m = vi.hoisted(() => ({ read: vi.fn(), approve: vi.fn(), tenant: vi.fn(), db: vi.fn(), list: vi.fn(), inspect: vi.fn(), preview: vi.fn(), apply: vi.fn(), receipt: vi.fn() }));
vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/core/prisma', () => ({ getTenantDbFromContext: m.db, getTenantIdFromContext: m.tenant }));
vi.mock('@/lib/auth/finance-access', () => ({ requireFinanceAccess: m.read, requireFinanceApprover: m.approve }));
vi.mock('@/services/inventory/atk-recovery-service', () => ({ previewAtkRecovery: m.preview, applyAtkRecovery: m.apply, getAtkRecoveryReceipt: m.receipt }));
vi.mock('@/services/inventory/atk-recovery-backup', () => ({ atkRecoveryBackup: () => ({ ready: () => true }) }));
vi.mock('@/services/inventory/reconciliation-diagnosis-service', () => ({ listReconciliationCatalog: m.list, inspectInventoryReconciliation: m.inspect }));
import { listInventoryReconciliation, inspectInventoryReconciliationAction, previewAtkRecoveryAction, applyAtkRecoveryAction, getAtkRecoveryReceiptAction } from '../inventory-reconciliation';
const db = { scoped: true };
beforeEach(() => { vi.resetAllMocks(); m.db.mockReturnValue(db); m.tenant.mockReturnValue('tenant-context'); m.read.mockResolvedValue({ user: { role: 'FINANCE' } }); m.list.mockResolvedValue({ items: [], page: 1, hasMore: false }); m.inspect.mockResolvedValue({ variant: { id: 'sku' } }); });

describe('Finance ATK diagnosis action boundary', () => {
    const input = { sourceMovementId: 'loss', kind: 'REFUND', requestId: '11111111-1111-4111-8111-111111111111', fingerprint: 'a'.repeat(64), postingDate: '2026-01-15', reason: 'Synthetic verified source', confirmed: true };
    it('guards recovery actions and derives actor/tenant from server, rejecting arbitrary amounts', async () => {
        m.approve.mockResolvedValue({ user: { id: 'server-actor' } });
        expect(await previewAtkRecoveryAction({ sourceMovementId: 'loss', kind: 'REFUND' })).toMatchObject({ success: true });
        expect(await applyAtkRecoveryAction(input)).toMatchObject({ success: true });
        expect(m.apply).toHaveBeenCalledWith(db, input, 'server-actor', expect.anything());
        expect(await applyAtkRecoveryAction({ ...input, amount: 999 })).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
        expect(await applyAtkRecoveryAction({ ...input, confirmed: false })).toMatchObject({ success: false });
        expect(await getAtkRecoveryReceiptAction({ requestId: input.requestId })).toMatchObject({ success: true });
        expect(m.receipt).toHaveBeenCalledWith(db, input.requestId);
        m.approve.mockRejectedValue(new AuthorizationError());
        expect(await applyAtkRecoveryAction(input)).toMatchObject({ success: false, code: 'AUTHORIZATION_ERROR' });
        expect(m.apply).toHaveBeenCalledTimes(1);
    });
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
