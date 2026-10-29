import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthorizationError } from '@/lib/errors/errors';
const m = vi.hoisted(() => ({ read: vi.fn(), approve: vi.fn(), inspect: vi.fn(), apply: vi.fn(), order: vi.fn(), accounts: vi.fn(), tenant: vi.fn(), db: vi.fn(), previewPeriod: vi.fn(), startPeriod: vi.fn() }));
vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/core/prisma', () => ({ getTenantDbFromContext: m.db, getTenantIdFromContext: m.tenant }));
vi.mock('@/lib/auth/finance-access', () => ({ requireFinanceAccess: m.read, requireFinanceApprover: m.approve }));
vi.mock('@/services/production/cost-recovery-service', () => ({ inspectProductionCostRecovery: m.inspect, applyProductionCostRecovery: m.apply }));
vi.mock('@/services/production/cost-recovery-backup', () => ({ productionRecoveryBackup: () => ({ ready: () => true }) }));
vi.mock('@/services/production/forward-cost-period-service', () => ({ previewForwardCostPeriod: m.previewPeriod, startForwardCostPeriod: m.startPeriod }));
import { applyProductionCost, inspectProductionCost, inspectForwardCostPeriod, activateForwardCostPeriod } from '../production-cost-recovery';
const id = '11111111-1111-4111-8111-111111111111';
const input = { orderId: id, fingerprint: 'a'.repeat(64), reason: 'Verified synthetic source', confirmed: true };

describe('production cost recovery action boundary', () => {
    beforeEach(() => {
        vi.resetAllMocks(); m.db.mockReturnValue({ productionOrder: { findUnique: m.order }, account: { findMany: m.accounts } }); m.tenant.mockReturnValue('tenant-a');
        m.read.mockResolvedValue({ user: { id: 'reader' } }); m.approve.mockResolvedValue({ user: { id: 'server-actor' } });
        m.order.mockResolvedValue({ id }); m.accounts.mockResolvedValue([]); m.inspect.mockResolvedValue({ status: 'unsupported' }); m.apply.mockResolvedValue({ auditId: 'audit', alreadyApplied: false });
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
    it('authorizes and validates forward-only preview and activation separately', async () => {
        m.previewPeriod.mockResolvedValue({alreadyApplied:false,version:1,fingerprint:'a'.repeat(64),historicalBalances:[{accountId:'wip',amount:'40.00'}],movementIds:['m'],executionIds:['e']});
        m.startPeriod.mockResolvedValue({alreadyApplied:false,auditId:'period'});
        expect(await inspectForwardCostPeriod({orderId:id})).toMatchObject({success:true,data:{version:1,historicalAmount:'40.00'}});
        expect(await activateForwardCostPeriod(input)).toMatchObject({success:true});
        expect(m.startPeriod).toHaveBeenCalledWith(m.db(),expect.objectContaining({actorId:'server-actor'}),expect.anything());
        expect(await activateForwardCostPeriod({...input,database:'other'})).toMatchObject({success:false});
        m.approve.mockRejectedValue(new AuthorizationError());
        expect(await activateForwardCostPeriod(input)).toMatchObject({success:false,code:'AUTHORIZATION_ERROR'});
    });
    it('returns not found without trying another tenant', async () => {
        m.order.mockResolvedValue(null);
        expect(await inspectProductionCost({ orderId: id })).toMatchObject({ success: false, code: 'NOT_FOUND' });
        expect(m.inspect).not.toHaveBeenCalled();
    });
    it('forwards REVIEWED_LEGACY_SEAL mode on inspect, derives version from preview, and maps accounts while preserving missing account IDs', async () => {
        m.accounts.mockResolvedValue([{ id: 'acc-wip', code: '1140', name: 'Barang Dalam Proses' }]);
        m.previewPeriod.mockResolvedValue({
            alreadyApplied: false,
            version: 2,
            mode: 'REVIEWED_LEGACY_SEAL',
            fingerprint: 'b'.repeat(64),
            historicalBalances: [
                { accountId: 'acc-wip', amount: '-125.50' },
                { accountId: 'acc-missing', amount: '40.00' },
            ],
            anomalies: [
                { category: 'VOIDED_EXECUTIONS', count: 1 },
                { category: 'NEGATIVE_ACCOUNT_POOLS_RETAINED', count: 1 },
            ],
            movementIds: ['m1', 'm2'],
            executionIds: ['e1', 'e2'],
            materialIssueIds: ['mi1'],
            scrapRecordIds: ['sr1', 'sr2'],
        });
        const res = await inspectForwardCostPeriod({ orderId: id, mode: 'REVIEWED_LEGACY_SEAL' });
        expect(m.previewPeriod).toHaveBeenCalledWith(m.db(), id, 'REVIEWED_LEGACY_SEAL');
        expect(res).toEqual({
            success: true,
            data: {
                alreadyApplied: false,
                version: 2,
                fingerprint: 'b'.repeat(64),
                historicalAmount: '-85.50',
                outputCount: 2,
                movementCount: 2,
                materialIssueCount: 1,
                scrapRecordCount: 2,
                storageReady: true,
                anomalies: [
                    { category: 'VOIDED_EXECUTIONS', count: 1 },
                    { category: 'NEGATIVE_ACCOUNT_POOLS_RETAINED', count: 1 },
                ],
                balances: [
                    { accountId: 'acc-wip', code: '1140', name: 'Barang Dalam Proses', amount: '-125.50' },
                    { accountId: 'acc-missing', code: null, name: null, amount: '40.00' },
                ],
            },
        });

        m.previewPeriod.mockResolvedValueOnce({
            alreadyApplied: true,
            version: 1,
            fingerprint: 'a'.repeat(64),
            historicalBalances: [{ accountId: 'acc-wip', amount: '40.00' }],
            movementIds: ['m1'],
            executionIds: ['e1'],
        });
        const appliedV1 = await inspectForwardCostPeriod({ orderId: id, mode: 'REVIEWED_LEGACY_SEAL' });
        expect(appliedV1).toMatchObject({
            success: true,
            data: {
                alreadyApplied: true,
                version: 1,
                anomalies: [],
                materialIssueCount: 0,
                scrapRecordCount: 0,
            },
        });
    });
    it('rejects invalid mode, missing anomaly acknowledgment, or short reason for REVIEWED_LEGACY_SEAL before calling service', async () => {
        const longReason = 'Menyegel riwayat SPK lama yang memiliki hasil void setelah ditinjau Finance';
        const refineMessage = 'Mode riwayat khusus memerlukan persetujuan anomali dan alasan minimal 30 karakter.';
        const genericMessage = 'Preview, alasan dan persetujuan wajib diisi.';
        expect(await inspectForwardCostPeriod({ orderId: id, mode: 'INVALID' })).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
        expect(await activateForwardCostPeriod({ ...input, mode: 'INVALID' })).toMatchObject({ success: false, code: 'VALIDATION_ERROR', error: genericMessage });
        expect(await activateForwardCostPeriod({ ...input, mode: 'REVIEWED_LEGACY_SEAL', reason: longReason })).toMatchObject({ success: false, code: 'VALIDATION_ERROR', error: refineMessage });
        expect(await activateForwardCostPeriod({ ...input, mode: 'REVIEWED_LEGACY_SEAL', reason: longReason, acknowledgeRetainedAnomalies: false })).toMatchObject({ success: false, code: 'VALIDATION_ERROR', error: refineMessage });
        expect(await activateForwardCostPeriod({ ...input, mode: 'REVIEWED_LEGACY_SEAL', reason: 'Too short for legacy seal', acknowledgeRetainedAnomalies: true })).toMatchObject({ success: false, code: 'VALIDATION_ERROR', error: refineMessage });
        expect(m.previewPeriod).not.toHaveBeenCalled();
        expect(m.startPeriod).not.toHaveBeenCalled();

        m.startPeriod.mockResolvedValue({ alreadyApplied: false, auditId: 'seal-audit' });
        expect(await activateForwardCostPeriod({
            ...input,
            mode: 'REVIEWED_LEGACY_SEAL',
            reason: longReason,
            acknowledgeRetainedAnomalies: true,
        })).toMatchObject({ success: true });
        expect(m.startPeriod).toHaveBeenCalledWith(
            m.db(),
            expect.objectContaining({
                orderId: id,
                actorId: 'server-actor',
                mode: 'REVIEWED_LEGACY_SEAL',
                acknowledgeRetainedAnomalies: true,
                reason: longReason,
            }),
            expect.anything(),
        );
    });
});
