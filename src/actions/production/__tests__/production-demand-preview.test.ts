import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    route: vi.fn(), bom: vi.fn(), auth: vi.fn(), enabled: vi.fn(), createOrder: vi.fn(), createRun: vi.fn(),
}));
vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/tools/auth-checks', () => ({ requireProductionLeaderRole: mocks.auth, requireAuth: vi.fn() }));
vi.mock('@/lib/core/prisma', () => ({ prisma: { productionRoute: { findFirst: mocks.route }, bom: { findFirst: mocks.bom } } }));
vi.mock('@/lib/production/routing-feature-flag', () => ({ isRoutingEnabled: mocks.enabled }));
vi.mock('@/services/production/fg-demand-service', () => ({ listFgDemandBoard: vi.fn() }));
vi.mock('@/services/production/order-service', () => ({ ProductionOrderService: { createOrder: mocks.createOrder } }));
vi.mock('@/services/production/routing-run-service', () => ({ ProductionRoutingRunService: { createRun: mocks.createRun } }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
import { previewSpkFromDemand } from '../production-demand';
import { AuthorizationError } from '@/lib/errors/errors';

beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: 'test-user' } });
    mocks.enabled.mockResolvedValue(true);
    mocks.bom.mockResolvedValue({ id: 'test-bom' });
});

describe('read-only demand creation preview', () => {
    it('uses active default routing and counts one SPK per step', async () => {
        mocks.route.mockResolvedValue({ name: 'Test routing', _count: { steps: 3 } });
        expect(await previewSpkFromDemand('test-variant')).toEqual({ success: true, data: { kind: 'run', routeName: 'Test routing', orderCount: 3 } });
        expect(mocks.route).toHaveBeenCalledWith({ where: { productVariantId: 'test-variant', status: 'ACTIVE', isDefault: true }, select: { name: true, _count: { select: { steps: true } } } });
        expect(mocks.bom).not.toHaveBeenCalled();
        expect(mocks.createOrder).not.toHaveBeenCalled();
        expect(mocks.createRun).not.toHaveBeenCalled();
    });
    it.each([true, false])('uses default BOM fallback when routing enabled=%s but no route', async (enabled) => {
        mocks.enabled.mockResolvedValue(enabled);
        mocks.route.mockResolvedValue(null);
        expect(await previewSpkFromDemand('test-variant')).toEqual({ success: true, data: { kind: 'order', orderCount: 1 } });
        if (!enabled) expect(mocks.route).not.toHaveBeenCalled();
        expect(mocks.bom).toHaveBeenCalledWith({ where: { productVariantId: 'test-variant', isActive: true, isDefault: true }, select: { id: true } });
    });
    it('reports missing BOM instead of promising a creatable SPK', async () => {
        mocks.bom.mockResolvedValue(null);
        const result = await previewSpkFromDemand('test-variant');
        expect(result.success).toBe(false);
        if (!result.success) expect(result.error).toContain('BOM default aktif');
    });
    it('rejects missing product before querying', async () => {
        expect((await previewSpkFromDemand('')).success).toBe(false);
        expect(mocks.route).not.toHaveBeenCalled();
    });
    it('enforces the existing production leader guard before reading data', async () => {
        mocks.auth.mockRejectedValue(new AuthorizationError('Tidak diizinkan'));
        expect((await previewSpkFromDemand('test-variant')).success).toBe(false);
        expect(mocks.enabled).not.toHaveBeenCalled();
        expect(mocks.route).not.toHaveBeenCalled();
        expect(mocks.bom).not.toHaveBeenCalled();
    });
});
