import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    guard: vi.fn(), tenantDb: vi.fn(), loads: vi.fn(), receivable: vi.fn(), material: vi.fn(),
    shipped: vi.fn(), received: vi.fn(), materialIssues: vi.fn(), attention: vi.fn(), stockOpnameCount: vi.fn(),
}));
vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: (...args: never[]) => unknown) => fn }));
vi.mock('@/lib/mobile/mobile-portal-access', () => ({ requireMobilePortalAccess: mocks.guard }));
vi.mock('@/lib/core/prisma', () => ({ getTenantDbFromContext: mocks.tenantDb }));
vi.mock('@/services/inventory/warehouse-operational-reader', () => ({
    readWarehouseOpenLoadCounts: mocks.loads, readWarehouseReceivablePOs: mocks.receivable,
    readWarehouseMaterialQueue: mocks.material, readWarehouseTodayShipped: mocks.shipped,
    readWarehouseTodayReceived: mocks.received, readWarehouseTodayMaterialIssues: mocks.materialIssues,
    readWarehouseLoadingAttention: mocks.attention,
}));
vi.mock('@/lib/errors/errors', () => ({
    BusinessRuleError: class BusinessRuleError extends Error {},
    safeAction: async (fn: () => Promise<unknown>) => { try { return { success: true as const, data: await fn() }; } catch (error) { return { success: false as const, error: error instanceof Error ? error.message : String(error) }; } },
}));
import { getWarehouseMobileDashboard } from '../warehouse-mobile-dashboard';
const db = { stockOpname: { count: mocks.stockOpnameCount } };
const access = (permissions: string[] | 'ALL' = 'ALL') => ({ portal: { id: 'warehouse' }, permissions });
function setup() {
    mocks.guard.mockResolvedValue(access()); mocks.tenantDb.mockReturnValue(db);
    mocks.loads.mockResolvedValue({ openLoadOrders: 7, loadingOrders: 3, pendingOrders: 4 });
    mocks.receivable.mockResolvedValue(5); mocks.material.mockResolvedValue(2); mocks.shipped.mockResolvedValue(6);
    mocks.received.mockResolvedValue(8); mocks.materialIssues.mockResolvedValue(11);
    mocks.attention.mockResolvedValue({ total: 10, returned: 1, items: [{ id: 'do-1', number: 'DO-001', customerName: 'Customer A', deliveryDate: '2026-10-10T01:00:00.000Z', href: '/warehouse/mobile/outgoing/do-1' }] });
    mocks.stockOpnameCount.mockResolvedValue(9);
}
beforeEach(() => { vi.resetAllMocks(); setup(); });

describe('getWarehouseMobileDashboard', () => {
    it('denies before tenant resolution or reads', async () => {
        mocks.guard.mockRejectedValue(new Error('mobile denied'));
        expect(await getWarehouseMobileDashboard()).toEqual({ success: false, error: 'mobile denied' });
        expect(mocks.tenantDb).not.toHaveBeenCalled(); expect(mocks.loads).not.toHaveBeenCalled();
    });
    it('projects all contracted facts, server detail hrefs, and generatedAt after reads', async () => {
        vi.useFakeTimers(); try {
            vi.setSystemTime(new Date('2026-10-10T01:00:00Z'));
            mocks.stockOpnameCount.mockImplementation(async () => { vi.setSystemTime(new Date('2026-10-10T02:00:00Z')); return 9; });
            const result = await getWarehouseMobileDashboard(); expect(result.success).toBe(true); if (!result.success) return;
            expect(result.data).toMatchObject({
                generatedAt: '2026-10-10T02:00:00.000Z', loads: { status: 'AVAILABLE', data: { loading: 3, pending: 4 } },
                receiving: { status: 'AVAILABLE', data: { receivable: 5 } }, materialQueue: { status: 'AVAILABLE', data: { count: 2 } },
                todayShipped: { status: 'AVAILABLE', data: { count: 6 } }, todayReceived: { status: 'AVAILABLE', data: { count: 8 } },
                todayMaterialIssues: { status: 'AVAILABLE', data: { count: 11 } },
                loadingAttention: { status: 'AVAILABLE', data: { total: 10, returned: 1, items: [{ href: '/warehouse/mobile/outgoing/do-1' }] } },
                openOpname: { status: 'AVAILABLE', data: { count: 9 } },
            });
            expect(mocks.attention).toHaveBeenCalledWith(db, 3, expect.any(Function));
        } finally { vi.useRealTimers(); }
    });
    it('projects nested permissions and skips uncovered links/data/identity', async () => {
        mocks.guard.mockResolvedValue(access(['/warehouse/mobile/incoming']));
        const result = await getWarehouseMobileDashboard(); expect(result.success).toBe(true); if (!result.success) return;
        expect(result.data.links).toEqual({ outgoing: null, incoming: '/warehouse/mobile/incoming', opname: null });
        expect(result.data.loads.status).toBe('HIDDEN'); expect(result.data.loadingAttention.status).toBe('HIDDEN'); expect(result.data.openOpname.status).toBe('HIDDEN');
        expect(result.data.receiving).toEqual({ status: 'AVAILABLE', data: { receivable: 5 } });
        expect(mocks.loads).not.toHaveBeenCalled(); expect(mocks.attention).not.toHaveBeenCalled(); expect(mocks.stockOpnameCount).not.toHaveBeenCalled();
    });
    it.each([
        ['loads', mocks.loads], ['receiving', mocks.receivable], ['materialQueue', mocks.material], ['todayShipped', mocks.shipped],
        ['todayReceived', mocks.received], ['todayMaterialIssues', mocks.materialIssues], ['loadingAttention', mocks.attention], ['openOpname', mocks.stockOpnameCount],
    ] as const)('keeps failed %s independent', async (section, reader) => {
        reader.mockRejectedValue(new Error('failed')); const result = await getWarehouseMobileDashboard(); expect(result.success).toBe(true); if (!result.success) return;
        expect(result.data[section]).toEqual({ status: 'UNAVAILABLE', data: null });
    });
    it('keeps valid zero and empty AVAILABLE', async () => {
        mocks.loads.mockResolvedValue({ openLoadOrders: 0, loadingOrders: 0, pendingOrders: 0 }); mocks.receivable.mockResolvedValue(0); mocks.material.mockResolvedValue(0);
        mocks.shipped.mockResolvedValue(0); mocks.received.mockResolvedValue(0); mocks.materialIssues.mockResolvedValue(0);
        mocks.attention.mockResolvedValue({ total: 0, returned: 0, items: [] }); mocks.stockOpnameCount.mockResolvedValue(0);
        const result = await getWarehouseMobileDashboard(); expect(result.success).toBe(true); if (!result.success) return;
        expect(result.data.todayMaterialIssues).toEqual({ status: 'AVAILABLE', data: { count: 0 } });
        expect(result.data.loadingAttention).toEqual({ status: 'AVAILABLE', data: { total: 0, returned: 0, items: [] } });
    });
    it('fails whole action for missing tenant context', async () => {
        mocks.tenantDb.mockReturnValue(undefined); expect(await getWarehouseMobileDashboard()).toMatchObject({ success: false }); expect(mocks.loads).not.toHaveBeenCalled();
    });
});
