import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SparePartStockService } from '../sparepart-stock-service';
import { prisma } from '@/lib/core/prisma';
import { InventoryCoreService } from '@/services/inventory/core-service';
import { AccountingService } from '@/services/accounting/accounting-service';
import { logActivity } from '@/lib/tools/audit';

vi.mock('@/lib/core/prisma', () => {
  const db: any = {
    inventory: { findMany: vi.fn() },
    location: { findUnique: vi.fn() },
    productVariant: { findUnique: vi.fn() },
    stockMovement: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  db.$transaction.mockImplementation(async (cb: any) => cb(db));
  return { prisma: db };
});
vi.mock('@/services/inventory/core-service', () => ({
  InventoryCoreService: { incrementStockWithCost: vi.fn() },
}));
vi.mock('@/services/accounting/accounting-service', () => ({
  AccountingService: { recordInventoryMovement: vi.fn() },
}));
vi.mock('@/lib/tools/audit', () => ({ logActivity: vi.fn() }));
vi.mock('@/lib/locations/resolve-location', () => ({
  isEligibleMaterialSourceLocation: (l: any) => l?.locationType === 'INTERNAL',
}));

beforeEach(() => { vi.clearAllMocks(); });

describe('SparePartStockService.stockIn', () => {
  const input: any = { locationId: 'loc-1', productVariantId: 'v-sp', quantity: 4, unitCost: 50000, clientRequestId: '33333333-3333-4333-8333-333333333333' };
  it('tambah stok + movement + jurnal + audit', async () => {
    (prisma.location.findUnique as any).mockResolvedValue({ id: 'loc-1', locationType: 'INTERNAL' });
    (prisma.productVariant.findUnique as any).mockResolvedValue({ id: 'v-sp', archivedAt: null, product: { productType: 'OPERATIONAL' } });
    (prisma.stockMovement.create as any).mockResolvedValue({ id: 'mv1' });
    await SparePartStockService.stockIn(input, 'u1');
    expect(InventoryCoreService.incrementStockWithCost).toHaveBeenCalled();
    expect(AccountingService.recordInventoryMovement).toHaveBeenCalled();
    expect(logActivity).toHaveBeenCalled();
  });
  it('tolak varian non-OPERATIONAL', async () => {
    (prisma.location.findUnique as any).mockResolvedValue({ id: 'loc-1', locationType: 'INTERNAL' });
    (prisma.productVariant.findUnique as any).mockResolvedValue({ id: 'v-rm', archivedAt: null, product: { productType: 'RAW_MATERIAL' } });
    await expect(SparePartStockService.stockIn(input, 'u1')).rejects.toThrow();
  });
  it('tolak lokasi non-internal', async () => {
    (prisma.location.findUnique as any).mockResolvedValue({ id: 'loc-9', locationType: 'EXTERNAL' });
    await expect(SparePartStockService.stockIn(input, 'u1')).rejects.toThrow();
  });
});
