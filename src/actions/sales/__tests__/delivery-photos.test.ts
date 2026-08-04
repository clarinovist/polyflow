import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib/core/prisma';

vi.mock('@/lib/core/prisma', () => ({
  prisma: {
    deliveryOrder: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/core/tenant', () => ({
  withTenant: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock('@/lib/auth/sales-access', () => ({
  requireSalesAccess: vi.fn().mockResolvedValue({ user: { id: 'u1' } }),
}));

vi.mock('@/lib/errors/errors', () => ({
  safeAction: async (fn: () => Promise<unknown>) => {
    try {
      const data = await fn();
      return { success: true, data };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  },
  BusinessRuleError: class extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'BusinessRuleError';
    }
  },
}));

vi.mock('@/lib/tools/audit', () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { attachDeliveryPhoto } from '../delivery-photos';

const makeDo = (status: string) => ({
  id: 'do-1',
  status,
  orderNumber: 'DO-001',
  salesOrderId: 'so-1',
});

describe('attachDeliveryPhoto — shared lifecycle policy is the authority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts vehicle photo when DO is PENDING', async () => {
    vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue(
      makeDo('PENDING') as never,
    );
    vi.mocked(prisma.deliveryOrder.update).mockResolvedValue({} as never);

    const result = await attachDeliveryPhoto({
      deliveryOrderId: 'do-1',
      photoType: 'vehicle',
      publicUrl: 'https://r2/veh.jpg',
    });

    expect(result).toEqual({ success: true, data: { success: true } });
    expect(prisma.deliveryOrder.update).toHaveBeenCalledWith({
      where: { id: 'do-1' },
      data: { vehiclePhotoUrl: 'https://r2/veh.jpg' },
    });
  });

  it('rejects vehicle photo when DO is IN_TRANSIT', async () => {
    vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue(
      makeDo('IN_TRANSIT') as never,
    );

    const result = await attachDeliveryPhoto({
      deliveryOrderId: 'do-1',
      photoType: 'vehicle',
      publicUrl: 'https://r2/veh.jpg',
    });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain('Foto truk');
    expect((result as { error: string }).error).toContain('PENDING/LOADING/SHIPPED');
    expect(prisma.deliveryOrder.update).not.toHaveBeenCalled();
  });

  it('accepts POD photo when DO is DELIVERED and receiver name given', async () => {
    vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue(
      makeDo('DELIVERED') as never,
    );
    vi.mocked(prisma.deliveryOrder.update).mockResolvedValue({} as never);

    const result = await attachDeliveryPhoto({
      deliveryOrderId: 'do-1',
      photoType: 'proof_of_delivery',
      publicUrl: 'https://r2/pod.jpg',
      receivedBy: 'Budi',
    });

    expect(result).toEqual({ success: true, data: { success: true } });
    expect(prisma.deliveryOrder.update).toHaveBeenCalledWith({
      where: { id: 'do-1' },
      data: expect.objectContaining({
        proofOfDeliveryUrl: 'https://r2/pod.jpg',
        receivedBy: 'Budi',
      }),
    });
  });

  it('rejects POD photo when DO is PENDING', async () => {
    vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue(
      makeDo('PENDING') as never,
    );

    const result = await attachDeliveryPhoto({
      deliveryOrderId: 'do-1',
      photoType: 'proof_of_delivery',
      publicUrl: 'https://r2/pod.jpg',
      receivedBy: 'Budi',
    });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain('Bukti terima');
    expect(prisma.deliveryOrder.update).not.toHaveBeenCalled();
  });

  it('does not trust UI visibility: requires receiver name even when status allows POD', async () => {
    vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue(
      makeDo('SHIPPED') as never,
    );

    const result = await attachDeliveryPhoto({
      deliveryOrderId: 'do-1',
      photoType: 'proof_of_delivery',
      publicUrl: 'https://r2/pod.jpg',
    });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain('Nama penerima');
    expect(prisma.deliveryOrder.update).not.toHaveBeenCalled();
  });

  it('returns not-found error for unknown DO', async () => {
    vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue(null);

    const result = await attachDeliveryPhoto({
      deliveryOrderId: 'missing',
      photoType: 'vehicle',
      publicUrl: 'https://r2/veh.jpg',
    });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain('Delivery Order tidak ditemukan');
  });
});
