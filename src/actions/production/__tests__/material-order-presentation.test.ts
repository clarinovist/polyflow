import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMaterialOrderDetail, submitMaterialOrder, approveMaterialOrder, rejectMaterialOrder } from '../material-orders';
import { prisma } from '@/lib/core/prisma';
import { requireAuth } from '@/lib/tools/auth-checks';
import { MaterialOrderService } from '@/services/production/material-order-service';
import { NotificationService } from '@/services/core/notification-service';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/utils/utils', () => ({ serializeData: (data: unknown) => data }));
vi.mock('@/lib/tools/auth-checks', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/core/prisma', () => ({ prisma: { productVariant: { findMany: vi.fn() }, userRole: { findMany: vi.fn() }, user: { findMany: vi.fn() } } }));
vi.mock('@/services/production/material-order-service', () => ({ MaterialOrderService: { getById: vi.fn(), submit: vi.fn(), approve: vi.fn(), reject: vi.fn() } }));
vi.mock('@/services/core/notification-service', () => ({ NotificationService: { createBulkNotifications: vi.fn() } }));
const order = { id: 'mo-test', orderNumber: 'MO-TEST', orderType: 'HD', status: 'PENDING', createdById: 'creator', items: [{ id: 'line', productVariantId: 'variant-test', quantity: 12, zakQuantity: 0, note: null }] };
const auth = (role: string, userId = 'manager') => vi.mocked(requireAuth).mockResolvedValue({ user: { id: userId, role, roles: [role] } } as never);
beforeEach(() => {
    vi.resetAllMocks();
    auth('FACTORY_MANAGER');
    vi.mocked(MaterialOrderService.submit).mockResolvedValue({ id: 'mo-test', idempotent: false } as never);
    vi.mocked(MaterialOrderService.getById).mockResolvedValue(order as never);
    vi.mocked(MaterialOrderService.approve).mockResolvedValue(order as never);
    vi.mocked(prisma.productVariant.findMany).mockResolvedValue([{ id: 'variant-test', name: 'Bahan A', skuCode: 'BA-01' }] as never);
    vi.mocked(prisma.userRole.findMany).mockResolvedValue([]);
    vi.mocked(prisma.user.findMany).mockResolvedValue([]);
});

describe('material order read presentation mirrors, never replaces, action guards', () => {
    it('resolves material identity in a bounded query without inventing a unit', async () => {
        const res = await getMaterialOrderDetail('mo-test');
        expect(res.success).toBe(true);
        if (!res.success) return;
        expect(res.data.items[0]).toMatchObject({ quantity: 12, material: { name: 'Bahan A', skuCode: 'BA-01' } });
        expect(res.data.items[0]).not.toHaveProperty('unit');
        expect(res.data.viewer).toEqual({ canApprove: true, canReject: true });
        expect(prisma.productVariant.findMany).toHaveBeenCalledWith({ where: { id: { in: ['variant-test'] } }, select: { id: true, name: true, skuCode: true } });
    });
    it.each(['DRAFT', 'APPROVED', 'REJECTED', 'CANCELLED'])('shows no review action for %s', async (status) => {
        vi.mocked(MaterialOrderService.getById).mockResolvedValue({ ...order, status } as never);
        const res = await getMaterialOrderDetail('mo-test');
        if (!res.success) throw new Error('read failed');
        expect(res.data.viewer).toEqual({ canApprove: false, canReject: false });
    });
    it('keeps non-approvers read-only and server rejects forged approval/rejection', async () => {
        auth('PRODUCTION');
        const res = await getMaterialOrderDetail('mo-test');
        if (!res.success) throw new Error('read failed');
        expect(res.data.viewer).toEqual({ canApprove: false, canReject: false });
        expect((await approveMaterialOrder('mo-test')).success).toBe(false);
        expect((await rejectMaterialOrder('mo-test', 'Alasan')).success).toBe(false);
        expect(MaterialOrderService.approve).not.toHaveBeenCalled();
        expect(MaterialOrderService.reject).not.toHaveBeenCalled();
    });
    it('prevents manager self approval, while keeping the existing admin exception', async () => {
        auth('FACTORY_MANAGER', 'creator');
        let res = await getMaterialOrderDetail('mo-test');
        if (!res.success) throw new Error('read failed');
        expect(res.data.viewer).toEqual({ canApprove: false, canReject: true });
        expect((await approveMaterialOrder('mo-test')).success).toBe(false);
        auth('ADMIN', 'creator');
        res = await getMaterialOrderDetail('mo-test');
        if (!res.success) throw new Error('read failed');
        expect(res.data.viewer.canApprove).toBe(true);
        expect((await approveMaterialOrder('mo-test')).success).toBe(true);
    });
    it('uses existing DB role fallback when session roles are empty', async () => {
        vi.mocked(requireAuth).mockResolvedValue({ user: { id: 'manager' } } as never);
        vi.mocked(prisma.userRole.findMany).mockResolvedValue([{ role: 'FACTORY_MANAGER' }] as never);
        const res = await getMaterialOrderDetail('mo-test');
        if (!res.success) throw new Error('read failed');
        expect(res.data.viewer.canApprove).toBe(true);
        expect((await approveMaterialOrder('mo-test')).success).toBe(true);
    });
    it('returns an explicit missing identity instead of falling back to raw UUID', async () => {
        vi.mocked(prisma.productVariant.findMany).mockResolvedValue([]);
        const res = await getMaterialOrderDetail('mo-test');
        if (!res.success) throw new Error('read failed');
        expect(res.data.items[0].material).toBeNull();
    });
    it('does not turn a failed identity query into an empty success', async () => {
        vi.mocked(prisma.productVariant.findMany).mockRejectedValue(new Error('unavailable'));
        expect((await getMaterialOrderDetail('mo-test')).success).toBe(false);
    });
    it('links approval notification to the actual mobile detail route', async () => {
        vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'manager' }] as never);
        expect((await submitMaterialOrder('mo-test')).success).toBe(true);
        expect(NotificationService.createBulkNotifications).toHaveBeenCalledWith([expect.objectContaining({ link: '/production/mobile/material-orders/mo-test' })]);
    });
    it('preserves best-effort notifications and authorized rejection', async () => {
        vi.mocked(prisma.user.findMany).mockRejectedValue(new Error('notification unavailable'));
        expect((await submitMaterialOrder('mo-test')).success).toBe(true);
        expect((await approveMaterialOrder('mo-test')).success).toBe(true);
        expect((await rejectMaterialOrder('mo-test', 'Bahan tidak sesuai')).success).toBe(true);
        expect(MaterialOrderService.reject).toHaveBeenCalledWith('mo-test', 'manager', 'Bahan tidak sesuai');
    });
});
