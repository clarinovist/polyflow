import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthorizationError } from '@/lib/errors/errors';
const m = vi.hoisted(() => ({ read: vi.fn(), approve: vi.fn(), inspect: vi.fn(), apply: vi.fn(), order: vi.fn(), tenant: vi.fn(), db: vi.fn() }));
vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/core/prisma', () => ({ getTenantDbFromContext: m.db, getTenantIdFromContext: m.tenant }));
vi.mock('@/lib/auth/finance-access', () => ({ requireFinanceAccess: m.read, requireFinanceApprover: m.approve }));
vi.mock('@/services/production/cost-recovery-service', () => ({ inspectProductionCostRecovery: m.inspect, applyProductionCostRecovery: m.apply }));
vi.mock('@/services/production/cost-recovery-backup', () => ({ productionRecoveryBackup: () => ({ ready: () => true }) }));
import { applyProductionCost, inspectProductionCost } from '../production-cost-recovery';
const id = '11111111-1111-4111-8111-111111111111';
const input = { orderId: id, fingerprint: 'a'.repeat(64), reason: 'Verified synthetic source', confirmed: true };

describe('production cost recovery action boundary', () => {
    beforeEach(() => {
        vi.resetAllMocks(); m.db.mockReturnValue({ productionOrder: { findUnique: m.order } }); m.tenant.mockReturnValue('tenant-a');
        m.read.mockResolvedValue({ user: { id: 'reader' } }); m.approve.mockResolvedValue({ user: { id: 'server-actor' } });
        m.order.mockResolvedValue({ id }); m.inspect.mockResolvedValue({ status: 'unsupported' }); m.apply.mockResolvedValue({ auditId: 'audit', alreadyApplied: false });
    });
    it('derives actor and tenant server-side and looks up exact order in tenant DB', async () => {
        expect(await inspectProductionCost({ orderNumber: 'WO-SYNTHETIC' })).toMatchObject({ success: true });
        expect(m.order).toHaveBeenCalledWith({ where: { orderNumber: 'WO-SYNTHETIC' }, select: { id: true } });
        expect(await applyProductionCost(input)).toMatchObject({ success: true });
        expect(m.apply).toHaveBeenCalledWith(m.db(), expect.objectContaining({ actorId: 'server-actor', orderId: id }), expect.anything());
    });
    it.each(['actorId', 'database', 'amount', 'backupReference'])('rejects browser supplied %s', async key => {
        expect(await applyProductionCost({ ...input, [key]: 'tampered' })).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
        expect(m.apply).not.toHaveBeenCalled();
    });
    it('requires explicit confirmation and one exact lookup', async () => {
        expect(await applyProductionCost({ ...input, confirmed: false })).toMatchObject({ success: false });
        expect(await inspectProductionCost({ orderId: id, orderNumber: 'WO-SYNTHETIC' })).toMatchObject({ success: false });
        expect(await inspectProductionCost({})).toMatchObject({ success: false });
        expect(m.inspect).not.toHaveBeenCalled(); expect(m.apply).not.toHaveBeenCalled();
    });
    it('denies unauthorized roles and absent tenant context before domain access', async () => {
        m.read.mockRejectedValue(new AuthorizationError()); m.approve.mockRejectedValue(new AuthorizationError());
        expect(await inspectProductionCost({ orderId: id })).toMatchObject({ success: false, code: 'AUTHORIZATION_ERROR' });
        expect(await applyProductionCost(input)).toMatchObject({ success: false, code: 'AUTHORIZATION_ERROR' });
        expect(m.order).not.toHaveBeenCalled(); expect(m.apply).not.toHaveBeenCalled();
        m.read.mockResolvedValue({ user: { id: 'reader' } }); m.tenant.mockReturnValue(undefined);
        expect(await inspectProductionCost({ orderId: id })).toMatchObject({ success: false, code: 'AUTHORIZATION_ERROR' });
    });
    it('returns not found without trying another tenant', async () => {
        m.order.mockResolvedValue(null);
        expect(await inspectProductionCost({ orderId: id })).toMatchObject({ success: false, code: 'NOT_FOUND' });
        expect(m.inspect).not.toHaveBeenCalled();
    });
});
