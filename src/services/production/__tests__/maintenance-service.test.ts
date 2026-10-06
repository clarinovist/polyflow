import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MaintenanceService } from '../maintenance-service';
import { prisma } from '@/lib/core/prisma';
import { logActivity } from '@/lib/tools/audit';

vi.mock('@/lib/core/prisma', () => {
  const db: any = {
    maintenanceRequest: { findUnique: vi.fn(), findFirst: vi.fn(), findUniqueOrThrow: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    maintenanceSparePartNeed: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn() },
    machineDowntime: { create: vi.fn(), updateMany: vi.fn() },
    inventory: { findMany: vi.fn(), findUnique: vi.fn() },
    stockMovement: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  db.$transaction.mockImplementation(async (cb: any) => cb(db));
  return { prisma: db };
});
vi.mock('@/lib/tools/audit', () => ({ logActivity: vi.fn() }));
vi.mock('@/services/inventory/core-service', () => ({
  InventoryCoreService: { validateAndLockStock: vi.fn(), deductStock: vi.fn() },
}));
vi.mock('@/services/accounting/accounting-service', () => ({
  AccountingService: { recordInventoryMovement: vi.fn() },
}));

const input: any = {
  machineId: 'mc-1',
  complaint: 'Gear bunyi kasar saat jalan',
  urgency: 'URGENT',
  machineStopped: true,
  clientRequestId: '22222222-2222-4222-8222-222222222222',
  spareParts: [{ name: 'Bearing 6205', quantity: 2 }],
};

beforeEach(() => { vi.clearAllMocks(); });

describe('MaintenanceService', () => {
  it('idempoten bila clientRequestId sudah ada', async () => {
    (prisma.maintenanceRequest.findUnique as any).mockResolvedValue({ id: 'mt1', status: 'DRAFT' });
    const r: any = await MaintenanceService.create(input, 'u1');
    expect(r.id).toBe('mt1');
    expect(r.idempotent).toBe(true);
  });
  it('approve hanya dari PENDING', async () => {
    (prisma.maintenanceRequest.findUnique as any).mockResolvedValue({ status: 'DRAFT', machineId: 'mc-1', machineStopped: false });
    await expect(MaintenanceService.approve('mt1', 'agus')).rejects.toThrow();
  });
  it('complete wajib catatan hasil', async () => {
    await expect(MaintenanceService.complete('mt1', 'tek', '   ', [])).rejects.toThrow();
  });
  it('approve buka downtime bila mesin berhenti + audit', async () => {
    (prisma.maintenanceRequest.findUnique as any).mockResolvedValue({ status: 'PENDING', machineId: 'mc-1', machineStopped: true });
    (prisma.machineDowntime.create as any).mockResolvedValue({ id: 'dt1' });
    (prisma.maintenanceRequest.updateMany as any).mockResolvedValue({ count: 1 });
    (prisma.maintenanceRequest.findUniqueOrThrow as any).mockResolvedValue({ id: 'mt1', orderNumber: 'MT-1' });
    const r: any = await MaintenanceService.approve('mt1', 'agus', 'Teknisi A');
    expect(r.id).toBe('mt1');
    expect(prisma.machineDowntime.create).toHaveBeenCalled();
    expect(logActivity).toHaveBeenCalled();
  });
  it('complete tutup downtime + tandai spare part', async () => {
    (prisma.maintenanceRequest.findUnique as any).mockResolvedValue({ status: 'IN_PROGRESS', downtimeId: 'dt1' });
    (prisma.maintenanceRequest.updateMany as any).mockResolvedValue({ count: 1 });
    (prisma.maintenanceRequest.findUniqueOrThrow as any).mockResolvedValue({ id: 'mt1', orderNumber: 'MT-1' });
    await MaintenanceService.complete('mt1', 'tek', 'Ganti bearing, normal kembali', ['sp1']);
    expect(prisma.machineDowntime.updateMany).toHaveBeenCalled();
    expect(prisma.maintenanceSparePartNeed.updateMany).toHaveBeenCalled();
  });
  it('complete keluarkan part ter-link dari stok + jurnal', async () => {
    (prisma.maintenanceRequest.findUnique as any).mockResolvedValue({ status: 'IN_PROGRESS', downtimeId: null });
    (prisma.maintenanceSparePartNeed.findMany as any).mockResolvedValue([
      { id: 'sp1', productVariantId: 'v-sp', sourceLocationId: 'loc-1', quantity: { toString: () => '2' }, name: 'Bearing' },
    ]);
    (prisma.maintenanceRequest.findUniqueOrThrow as any).mockResolvedValue({ id: 'mt1', orderNumber: 'MT-1' });
    (prisma.inventory.findUnique as any).mockResolvedValue({ averageCost: { toString: () => '50000' } });
    (prisma.maintenanceRequest.updateMany as any).mockResolvedValue({ count: 1 });
    const { InventoryCoreService } = await import('@/services/inventory/core-service');
    const { AccountingService } = await import('@/services/accounting/accounting-service');
    await MaintenanceService.complete('mt1', 'tek', 'Ganti bearing', ['sp1']);
    expect(InventoryCoreService.deductStock).toHaveBeenCalled();
    expect(AccountingService.recordInventoryMovement).toHaveBeenCalled();
  });
});
