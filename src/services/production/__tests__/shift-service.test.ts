import { describe, it, expect, vi, beforeEach } from 'vitest';
import { findActiveShift, findLatestShiftForOrder } from '../shift-service';

vi.mock('@/lib/core/prisma', () => ({
  prisma: {
    productionShift: {
      findFirst: vi.fn(),
    },
  },
}));

import { prisma } from '@/lib/core/prisma';

describe('findActiveShift', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns shift with operatorId when operator-specific shift is found', async () => {
    vi.mocked(prisma.productionShift.findFirst).mockResolvedValueOnce({
      id: 'shift-1',
      operatorId: 'op-1',
    } as never);

    const result = await findActiveShift({
      productionOrderId: 'po-1',
      operatorId: 'op-1',
    });

    expect(result).toEqual({ id: 'shift-1', operatorId: 'op-1' });
    expect(prisma.productionShift.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.productionShift.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          productionOrderId: 'po-1',
          operatorId: 'op-1',
        }),
      }),
    );
  });

  it('falls back to any active shift when operator-specific not found', async () => {
    // First call (operator match) returns null
    vi.mocked(prisma.productionShift.findFirst).mockResolvedValueOnce(null);
    // Second call (fallback) returns shift
    vi.mocked(prisma.productionShift.findFirst).mockResolvedValueOnce({
      id: 'shift-2',
      operatorId: 'op-2',
    } as never);

    const result = await findActiveShift({
      productionOrderId: 'po-1',
      operatorId: 'op-1',
    });

    expect(result).toEqual({ id: 'shift-2', operatorId: 'op-2' });
    expect(prisma.productionShift.findFirst).toHaveBeenCalledTimes(2);
    // Second call should NOT have operatorId filter
    expect(prisma.productionShift.findFirst).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          productionOrderId: 'po-1',
        }),
      }),
    );
    // Verify operatorId is NOT in the fallback query
    const secondCallArgs = vi.mocked(prisma.productionShift.findFirst).mock.calls[1]![0]!;
    expect(secondCallArgs.where).not.toHaveProperty('operatorId');
  });

  it('returns null when no active shift exists', async () => {
    vi.mocked(prisma.productionShift.findFirst).mockResolvedValue(null);

    const result = await findActiveShift({
      productionOrderId: 'po-1',
      operatorId: 'op-1',
    });

    expect(result).toBeNull();
    expect(prisma.productionShift.findFirst).toHaveBeenCalledTimes(2);
  });

  it('skips operator-specific query when no operatorId provided', async () => {
    vi.mocked(prisma.productionShift.findFirst).mockResolvedValueOnce({
      id: 'shift-3',
      operatorId: null,
    } as never);

    const result = await findActiveShift({
      productionOrderId: 'po-1',
    });

    expect(result).toEqual({ id: 'shift-3', operatorId: null });
    expect(prisma.productionShift.findFirst).toHaveBeenCalledTimes(1);
  });

  it('returns null when no shift and no operatorId', async () => {
    vi.mocked(prisma.productionShift.findFirst).mockResolvedValue(null);

    const result = await findActiveShift({
      productionOrderId: 'po-1',
    });

    expect(result).toBeNull();
    expect(prisma.productionShift.findFirst).toHaveBeenCalledTimes(1);
  });
});

describe('findLatestShiftForOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the latest shift for the order ordered by startTime desc', async () => {
    vi.mocked(prisma.productionShift.findFirst).mockResolvedValueOnce({
      id: 'shift-latest',
      operatorId: 'op-latest',
    } as never);

    const result = await findLatestShiftForOrder('po-1');

    expect(result).toEqual({ id: 'shift-latest', operatorId: 'op-latest' });
    expect(prisma.productionShift.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { productionOrderId: 'po-1' },
        orderBy: { startTime: 'desc' },
      }),
    );
  });

  it('returns null when order has no shifts at all', async () => {
    vi.mocked(prisma.productionShift.findFirst).mockResolvedValueOnce(null);

    const result = await findLatestShiftForOrder('po-empty');

    expect(result).toBeNull();
  });

  it('does not filter by time window (used as fallback for stale/expired shifts)', async () => {
    vi.mocked(prisma.productionShift.findFirst).mockResolvedValueOnce({
      id: 'shift-expired',
      operatorId: null,
    } as never);

    await findLatestShiftForOrder('po-1');

    const callArgs = vi.mocked(prisma.productionShift.findFirst).mock.calls[0]![0]!;
    expect(callArgs.where).not.toHaveProperty('startTime');
    expect(callArgs.where).not.toHaveProperty('endTime');
  });
});
