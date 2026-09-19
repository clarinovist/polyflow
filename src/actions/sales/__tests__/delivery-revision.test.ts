import { beforeEach, describe, it, expect, vi } from 'vitest';
import { getDeliveryRevisionEditor, findDeliveryRevisionProducts, reviseDeliveryLoad } from '../delivery-revision';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), editor: vi.fn(), search: vi.fn(), revise: vi.fn(), revalidate: vi.fn() }));
vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/auth/sales-access', () => ({ requireSalesAccess: mocks.auth }));
vi.mock('@/services/sales/delivery-revision-service', () => ({ getDeliveryRevision: mocks.editor, searchRevisionProducts: mocks.search, reviseDelivery: mocks.revise }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
const input = { deliveryOrderId: 'do', orderVersion: new Date().toISOString(), deliveryVersion: new Date().toISOString(), reason: 'Revisi fisik', items: [{ salesOrderItemId: 'item', quantity: 80 }] };
beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue({ user: { id: 'sales' } }); mocks.revise.mockResolvedValue({ salesOrderId: 'so', deliveryOrderId: 'do' }); });
describe('delivery revision actions', () => {
    it('authenticates each read and write before accessing tenant data', async () => {
        mocks.auth.mockRejectedValue(new Error('Unauthorized'));
        expect((await getDeliveryRevisionEditor('do')).success).toBe(false);
        expect((await findDeliveryRevisionProducts('product')).success).toBe(false);
        expect((await reviseDeliveryLoad(input)).success).toBe(false);
        expect(mocks.editor).not.toHaveBeenCalled(); expect(mocks.search).not.toHaveBeenCalled(); expect(mocks.revise).not.toHaveBeenCalled();
    });
    it('validates then delegates with actor, invalidates sales and warehouse mobile views', async () => {
        expect((await reviseDeliveryLoad(input)).success).toBe(true);
        expect(mocks.revise).toHaveBeenCalledWith(expect.objectContaining({ remainder: 'KEEP', additions: [] }), 'sales');
        expect(mocks.revalidate).toHaveBeenCalledWith('/warehouse/mobile/outgoing/do');
        expect(mocks.revalidate).toHaveBeenCalledWith('/sales/orders/so');
    });
    it('rejects invalid input and propagates service error without invalidation', async () => {
        expect((await reviseDeliveryLoad({ ...input, reason: '' })).success).toBe(false);
        expect(mocks.revise).not.toHaveBeenCalled();
        mocks.revise.mockRejectedValue(new Error('stale'));
        expect((await reviseDeliveryLoad(input)).success).toBe(false);
        expect(mocks.revalidate).not.toHaveBeenCalled();
    });
    it('loads editor and bounded search; rejects missing id and short query', async () => {
        await getDeliveryRevisionEditor('do'); await findDeliveryRevisionProducts('  product  ');
        expect(mocks.editor).toHaveBeenCalledWith('do'); expect(mocks.search).toHaveBeenCalledWith('product');
        expect((await getDeliveryRevisionEditor('')).success).toBe(false);
        expect((await findDeliveryRevisionProducts('a')).success).toBe(false);
    });
});
