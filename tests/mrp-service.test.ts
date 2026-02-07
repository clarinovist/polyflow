/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MrpService } from '../src/services/mrp-service';

// Mock the entire prisma module
vi.mock('@/lib/prisma', () => ({
  prisma: {
    salesOrder: {
      findUnique: vi.fn(),
    },
    productVariant: {
      findUnique: vi.fn(),
    },
    bom: {
      findFirst: vi.fn(),
    },
    inventory: {
      aggregate: vi.fn(),
    },
    stockReservation: {
      aggregate: vi.fn(),
    },
  },
}));

import { prisma } from '@/lib/prisma';

describe('MrpService - BOM Requirement Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mocks for inventory and reservations to avoid crashes
    vi.mocked(prisma.inventory.aggregate).mockResolvedValue({
        _sum: { quantity: { toNumber: () => 0 } }
    } as any);

    vi.mocked(prisma.stockReservation.aggregate).mockResolvedValue({
        _sum: { quantity: { toNumber: () => 0 } }
    } as any);
  });

  it('should identify a FINISHED_GOOD without a BOM as a missing BOM', async () => {
    // Setup Sales Order
    vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
      id: 'so-1',
      items: [
        { productVariantId: 'pv-fg', quantity: 10 }
      ]
    } as any);

    // Setup Product Variant (FINISHED_GOOD)
    vi.mocked(prisma.productVariant.findUnique).mockResolvedValue({
      id: 'pv-fg',
      name: 'Finished Good Item',
      primaryUnit: 'PCS',
      product: {
        productType: 'FINISHED_GOOD'
      }
    } as any);

    // Setup BOM (Missing)
    vi.mocked(prisma.bom.findFirst).mockResolvedValue(null);

    // Run Simulation
    const result = await MrpService.simulateMaterialRequirements('so-1');

    // Assert
    expect(result.missingBoms).toHaveLength(1);
    expect(result.missingBoms[0]).toEqual({
      productName: 'Finished Good Item',
      productVariantId: 'pv-fg'
    });
    expect(result.canProduce).toBe(false);
  });

  it('should NOT identify a RAW_MATERIAL without a BOM as a missing BOM', async () => {
    // Setup Sales Order
    vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
      id: 'so-2',
      items: [
        { productVariantId: 'pv-rm', quantity: 100 }
      ]
    } as any);

    // Setup Product Variant (RAW_MATERIAL)
    vi.mocked(prisma.productVariant.findUnique).mockResolvedValue({
      id: 'pv-rm',
      name: 'Raw Material Item',
      primaryUnit: 'KG',
      product: {
        productType: 'RAW_MATERIAL'
      }
    } as any);

    // Setup BOM (Missing)
    vi.mocked(prisma.bom.findFirst).mockResolvedValue(null);

    // Setup Inventory override for this test if needed
    vi.mocked(prisma.inventory.aggregate).mockResolvedValue({
        _sum: { quantity: { toNumber: () => 1000 } }
    } as any);

    // Run Simulation
    const result = await MrpService.simulateMaterialRequirements('so-2');

    // Assert
    expect(result.missingBoms).toHaveLength(0);
    expect(result.canProduce).toBe(true); // Assuming sufficient stock mock
  });

    it('should identify an INTERMEDIATE without a BOM as a missing BOM', async () => {
    // Setup Sales Order
    vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
      id: 'so-3',
      items: [
        { productVariantId: 'pv-int', quantity: 50 }
      ]
    } as any);

    // Setup Product Variant (INTERMEDIATE)
    vi.mocked(prisma.productVariant.findUnique).mockResolvedValue({
      id: 'pv-int',
      name: 'Intermediate Item',
      primaryUnit: 'KG',
      product: {
        productType: 'INTERMEDIATE'
      }
    } as any);

    // Setup BOM (Missing)
    vi.mocked(prisma.bom.findFirst).mockResolvedValue(null);

    // Run Simulation
    const result = await MrpService.simulateMaterialRequirements('so-3');

    // Assert
    expect(result.missingBoms).toHaveLength(1);
    expect(result.missingBoms[0]).toEqual({
        productName: 'Intermediate Item',
        productVariantId: 'pv-int'
    });
  });

      it('should identify a WIP without a BOM as a missing BOM', async () => {
    // Setup Sales Order
    vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
      id: 'so-4',
      items: [
        { productVariantId: 'pv-wip', quantity: 50 }
      ]
    } as any);

    // Setup Product Variant (WIP)
    vi.mocked(prisma.productVariant.findUnique).mockResolvedValue({
      id: 'pv-wip',
      name: 'WIP Item',
      primaryUnit: 'KG',
      product: {
        productType: 'WIP'
      }
    } as any);

    // Setup BOM (Missing)
    vi.mocked(prisma.bom.findFirst).mockResolvedValue(null);

    // Run Simulation
    const result = await MrpService.simulateMaterialRequirements('so-4');

    // Assert
    expect(result.missingBoms).toHaveLength(1);
    expect(result.missingBoms[0]).toEqual({
        productName: 'WIP Item',
        productVariantId: 'pv-wip'
    });
  });
});
