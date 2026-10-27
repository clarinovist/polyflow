import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthorizationError } from '@/lib/errors/errors';
import type { InternalUsageInput } from '@/lib/schemas/internal-usage';
const m = vi.hoisted(() => ({ permission: vi.fn(), tenant: vi.fn(), create: vi.fn(), detail: vi.fn(), history: vi.fn(), form: vi.fn(), readiness: vi.fn(), revalidate: vi.fn() }));
vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: (...args: unknown[]) => unknown) => (...args: unknown[]) => { m.tenant(); return fn(...args); } }));
vi.mock('@/lib/tools/auth-checks', () => ({ requireWarehouseResourcePermission: m.permission }));
vi.mock('@/services/inventory/internal-usage-service', () => ({ createInternalUsage: m.create }));
vi.mock('@/services/inventory/internal-usage-query-service', () => ({ getInternalUsageDetail: m.detail, getInternalUsageHistory: m.history, getInternalUsageFormData: m.form }));
vi.mock('@/services/inventory/internal-usage-readiness', () => ({ checkInternalUsageReadiness: m.readiness }));
vi.mock('next/cache', () => ({ revalidatePath: m.revalidate }));
import { checkInternalUsageReadinessAction, createInternalUsageAction, getInternalUsageDetailAction, getInternalUsageFormAction, getInternalUsageHistoryAction } from '../internal-usage';
const input = {} as InternalUsageInput;
beforeEach(() => { vi.resetAllMocks(); m.permission.mockResolvedValue({ user: { id: 'authenticated' } }); });
describe('internal usage action boundary', () => {
    it('wraps all reads/writes in tenant scope and fresh permission', async () => {
        await getInternalUsageHistoryAction(); await getInternalUsageDetailAction('id'); await getInternalUsageFormAction();
        m.create.mockResolvedValue({ id: 'created' }); expect(await createInternalUsageAction(input)).toEqual({ success: true, data: { id: 'created' } });
        expect(m.tenant).toHaveBeenCalledTimes(4);
        expect(m.permission).toHaveBeenCalledTimes(4); expect(m.permission).toHaveBeenCalledWith('/warehouse/internal-usage');
        expect(m.create).toHaveBeenCalledWith(input, 'authenticated'); expect(m.form).toHaveBeenCalledWith('authenticated');
        expect(m.history).toHaveBeenCalledWith({}); expect(m.detail).toHaveBeenCalledWith('id');
        expect(m.revalidate).toHaveBeenCalledWith('/warehouse/inventory/balance');
    });
    it('returns readiness with account detail only for Finance or Admin, without revalidating', async () => {
        const probe = { productVariantId: 'book', locationId: 'office', quantity: 2 };
        m.readiness.mockResolvedValue({ ready: true, message: 'siap' });
        expect(await checkInternalUsageReadinessAction(probe)).toEqual({ success: true, data: { ready: true, message: 'siap' } });
        expect(m.readiness).toHaveBeenLastCalledWith(probe, { includeAccounting: false });
        for (const user of [{ id: 'f', role: 'FINANCE' }, { id: 'a', role: 'WAREHOUSE', roles: ['ADMIN'] }]) {
            m.permission.mockResolvedValue({ user }); await checkInternalUsageReadinessAction(probe);
            expect(m.readiness).toHaveBeenLastCalledWith(probe, { includeAccounting: true });
        }
        expect(m.permission).toHaveBeenCalledWith('/warehouse/internal-usage'); expect(m.revalidate).not.toHaveBeenCalled();
        m.permission.mockRejectedValue(new AuthorizationError('denied'));
        expect(await checkInternalUsageReadinessAction(probe)).toMatchObject({ success: false }); expect(m.readiness).toHaveBeenCalledTimes(3);
    });
    it('denies before data reads, writes or revalidation', async () => {
        m.permission.mockRejectedValue(new AuthorizationError('denied'));
        for (const call of [() => createInternalUsageAction(input), getInternalUsageFormAction, () => getInternalUsageHistoryAction(), () => getInternalUsageDetailAction('id')]) {
            expect(await call()).toMatchObject({ success: false });
        }
        for (const fn of [m.create, m.form, m.history, m.detail, m.revalidate]) expect(fn).not.toHaveBeenCalled();
    });
    it('preserves authentication redirect exceptions', async () => {
        m.permission.mockRejectedValue(new Error('NEXT_REDIRECT'));
        await expect(getInternalUsageFormAction()).rejects.toThrow('NEXT_REDIRECT');
    });
});
