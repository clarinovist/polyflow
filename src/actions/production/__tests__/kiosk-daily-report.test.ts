import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ session: vi.fn(), feature: vi.fn(), module: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/auth/kiosk-operator-session', () => ({ getKioskOperatorSession: m.session }));
vi.mock('@/services/settings/kiosk-feature-service', () => ({ readKioskFeatureSettings: m.feature }));
vi.mock('@/lib/modules/guard', () => ({ requireModuleOrNextResponse: m.module }));
vi.mock('@/services/production/execution-service', () => ({ ProductionExecutionService: { addProductionOutput: m.post } }));
import { submitKioskDailyReports } from '../kiosk-daily-report';
import { BusinessRuleError } from '@/lib/errors/errors';

const entry = () => ({
    productionOrderId: 'order-1', shiftId: 'shift-1', operatorId: 'operator-1',
    helperIds: ['helper-1'], quantityProduced: 12, scrapQuantity: 0,
    clientRequestId: '11111111-1111-4111-8111-111111111111',
    startTime: new Date('2026-10-26T01:00:00Z'), endTime: new Date('2026-10-26T02:00:00Z'),
});
beforeEach(() => {
    vi.resetAllMocks();
    m.session.mockResolvedValue({ employeeId: 'operator-1', name: 'Operator uji', code: 'OP-TEST', tenantId: 'tenant-test' });
    m.module.mockResolvedValue(null);
    m.feature.mockResolvedValue(true);
    m.post.mockResolvedValue(undefined);
});

describe('submitKioskDailyReports', () => {
    it('requires a current PIN session, without NextAuth/API-key bypass', async () => {
        m.session.mockResolvedValue(null);
        expect(await submitKioskDailyReports([entry()])).toMatchObject({ success: false, error: expect.stringMatching(/PIN/) });
        expect(m.post).not.toHaveBeenCalled();
    });
    it.each(['module', 'feature'])('enforces the %s gate', async gate => {
        if (gate === 'module') m.module.mockResolvedValue({ status: 403 });
        else m.feature.mockResolvedValue(false);
        expect(await submitKioskDailyReports([entry()])).toMatchObject({ success: false });
        expect(m.post).not.toHaveBeenCalled();
    });
    it('uses server operator identity and system actor; ignores forged internal fields', async () => {
        const result = await submitKioskDailyReports([{ ...entry(), userId: 'forged', kioskOperator: { employeeId: 'forged', code: 'FORGED' } }]);
        expect(result).toEqual({ success: true, data: { status: 200, count: 1, results: [{ index: 0 }], errors: [] } });
        expect(m.post).toHaveBeenCalledWith(expect.objectContaining({
            operatorId: 'operator-1', userId: 'system', helperIds: ['helper-1'],
            kioskOperator: { employeeId: 'operator-1', code: 'OP-TEST' },
        }));
    });
    it('rejects a stale or spoofed operator instead of assigning another operator silently', async () => {
        expect(await submitKioskDailyReports([{ ...entry(), operatorId: 'another' }])).toMatchObject({ success: false, error: expect.stringMatching(/operator/i) });
        expect(m.post).not.toHaveBeenCalled();
    });
    it.each([
        { clientRequestId: undefined }, { clientRequestId: 'not-a-uuid' },
        { productionOrderId: '' }, { shiftId: '' }, { quantityProduced: -1 },
        { packagedOutput: { clientRequestId: '11111111-1111-4111-8111-111111111111', groups: [] } },
    ])('rejects invalid or out-of-scope entry %j', async patch => {
        expect(await submitKioskDailyReports([{ ...entry(), ...patch }])).toMatchObject({ success: false });
        expect(m.post).not.toHaveBeenCalled();
    });
    it('requires at least one entry', async () => {
        expect(await submitKioskDailyReports([])).toMatchObject({ success: false });
        expect(m.post).not.toHaveBeenCalled();
    });
    it('retains per-entry outcomes for partial failures and allows retrying only the failed entry', async () => {
        m.post.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new BusinessRuleError('Stok tidak cukup'));
        const failed = { ...entry(), clientRequestId: '22222222-2222-4222-8222-222222222222' };
        expect(await submitKioskDailyReports([entry(), failed])).toEqual({ success: true, data: {
            status: 207, count: 1, results: [{ index: 0 }], errors: [{ index: 1, error: 'Stok tidak cukup' }],
        } });
        expect(await submitKioskDailyReports([failed])).toMatchObject({ success: true, data: { count: 1 } });
        expect(m.post.mock.calls[2][0].clientRequestId).toBe(failed.clientRequestId);
    });
    it('does not return database/internal failure details to the public kiosk', async () => {
        m.post.mockRejectedValue(new Error('private database hostname'));
        expect(await submitKioskDailyReports([entry()])).toMatchObject({ success: true, data: {
            status: 207, errors: [{ index: 0, error: 'Gagal menyimpan entri. Silakan coba lagi.' }],
        } });
    });
});
