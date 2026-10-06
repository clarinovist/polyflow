import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MaterialOrderService } from '../material-order-service';
import { prisma } from '@/lib/core/prisma';
import { logActivity } from '@/lib/tools/audit';

vi.mock('@/lib/core/prisma', () => {
  const db: any = {
    materialOrder: { findUnique: vi.fn(), findFirst: vi.fn(), findUniqueOrThrow: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  };
  db.$transaction.mockImplementation(async (cb: any) => cb(db));
  return { prisma: db };
});
vi.mock('@/lib/tools/audit', () => ({ logActivity: vi.fn() }));

const input: any = {
  orderType: 'HD',
  clientRequestId: '11111111-1111-4111-8111-111111111111',
  items: [{ productVariantId: 'v1', quantity: 300, zakQuantity: 12, note: 'Ready' }],
};

beforeEach(() => { vi.clearAllMocks(); });

describe('MaterialOrderService', () => {
  it('idempoten bila clientRequestId sudah ada', async () => {
    (prisma.materialOrder.findUnique as any).mockResolvedValue({ id: 'm1', status: 'DRAFT' });
    const r: any = await MaterialOrderService.create(input, 'u1');
    expect(r.id).toBe('m1');
    expect(r.idempotent).toBe(true);
  });
  it('approve hanya dari PENDING (CAS)', async () => {
    (prisma.materialOrder.updateMany as any).mockResolvedValue({ count: 0 });
    await expect(MaterialOrderService.approve('m1', 'agus')).rejects.toThrow();
  });
  it('reject wajib alasan', async () => {
    await expect(MaterialOrderService.reject('m1', 'agus', '   ')).rejects.toThrow();
  });
  it('approve sukses + audit', async () => {
    (prisma.materialOrder.updateMany as any).mockResolvedValue({ count: 1 });
    (prisma.materialOrder.findUniqueOrThrow as any).mockResolvedValue({ id: 'm1', orderNumber: 'MO-HD-1' });
    const r: any = await MaterialOrderService.approve('m1', 'agus');
    expect(r.id).toBe('m1');
    expect(logActivity).toHaveBeenCalled();
  });
});
