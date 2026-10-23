import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MaterialOrderService } from '../material-order-service';
import { prisma } from '@/lib/core/prisma';
import { logActivity } from '@/lib/tools/audit';
vi.mock('@/lib/core/prisma', () => {
    const db = { materialOrder: { findUnique: vi.fn(), findFirst: vi.fn(), findUniqueOrThrow: vi.fn(), create: vi.fn(), updateMany: vi.fn() }, productVariant: { findMany: vi.fn() }, $transaction: vi.fn() };
    db.$transaction.mockImplementation((fn) => fn(db));
    return { prisma: db };
});
vi.mock('@/lib/tools/audit', () => ({ logActivity: vi.fn() }));
const request = { orderType: 'HD', clientRequestId: '11111111-1111-4111-8111-111111111111', items: [{ productVariantId: 'material', quantity: 10 }] };
beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.materialOrder.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.materialOrder.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.productVariant.findMany).mockResolvedValue([{ id: 'material', primaryUnit: 'PCS' }] as never);
    vi.mocked(prisma.materialOrder.create).mockResolvedValue({ id: 'mo', orderNumber: 'MO-01' } as never);
    vi.mocked(prisma.materialOrder.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.materialOrder.findUniqueOrThrow).mockResolvedValue({ id: 'mo', status: 'DRAFT', createdById: 'author', items: [] } as never);
});
describe('material request unit and retry invariants', () => {
    it('captures unit from the tenant master and ignores caller attempts to set another unit', async () => {
        await MaterialOrderService.create({ ...request, items: [{ ...request.items[0], quantityUnit: 'KG' }] } as never, 'author');
        expect(prisma.materialOrder.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ items: { create: [expect.objectContaining({ quantity: 10, quantityUnit: 'PCS' })] } }) }));
        expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE_MATERIAL_ORDER', tx: prisma }));
    });
    it('rejects missing/archived/foreign materials before creating any order', async () => {
        vi.mocked(prisma.productVariant.findMany).mockResolvedValue([]);
        await expect(MaterialOrderService.create(request, 'author')).rejects.toThrow('Bahan tidak tersedia');
        expect(prisma.materialOrder.create).not.toHaveBeenCalled();
        expect(logActivity).not.toHaveBeenCalled();
    });
    it('does not reuse another authors request token', async () => {
        vi.mocked(prisma.materialOrder.findUnique).mockResolvedValue({ id: 'mo', createdById: 'other' } as never);
        await expect(MaterialOrderService.create(request, 'author')).rejects.toThrow('Kunci permintaan');
        expect(prisma.materialOrder.create).not.toHaveBeenCalled();
    });
    it('only the creator submits and a pending retry is a no-op', async () => {
        await expect(MaterialOrderService.submit('mo', 'other')).rejects.toThrow('pembuat');
        expect(prisma.materialOrder.updateMany).not.toHaveBeenCalled();
        vi.mocked(prisma.materialOrder.findUniqueOrThrow).mockResolvedValue({ id: 'mo', status: 'PENDING', createdById: 'author', items: [] } as never);
        expect((await MaterialOrderService.submit('mo', 'author')).idempotent).toBe(true);
        expect(prisma.materialOrder.updateMany).not.toHaveBeenCalled();
        expect(logActivity).not.toHaveBeenCalled();
    });
    it('treats a retry after review as already submitted, without reopening the order', async () => {
        vi.mocked(prisma.materialOrder.findUniqueOrThrow).mockResolvedValue({ id: 'mo', status: 'APPROVED', createdById: 'author', items: [] } as never);
        expect((await MaterialOrderService.submit('mo', 'author')).idempotent).toBe(true);
        expect(prisma.materialOrder.updateMany).not.toHaveBeenCalled();
        expect(logActivity).not.toHaveBeenCalled();
    });
    it('audits a draft submission once and keeps compare-and-set status guard', async () => {
        expect((await MaterialOrderService.submit('mo', 'author')).idempotent).toBe(false);
        expect(prisma.materialOrder.updateMany).toHaveBeenCalledWith({ where: { id: 'mo', createdById: 'author', status: 'DRAFT' }, data: { status: 'PENDING' } });
        expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: 'SUBMIT_MATERIAL_ORDER', tx: prisma }));
        vi.mocked(prisma.materialOrder.updateMany).mockResolvedValue({ count: 0 });
        await expect(MaterialOrderService.submit('mo', 'author')).rejects.toThrow('DRAFT');
    });
});
