import { describe, it, expect, vi, beforeEach } from 'vitest';
import { recordInventoryMovement } from '../src/services/accounting/inventory-link-service';
import { prisma } from '../src/lib/prisma';
import { MovementType } from '@prisma/client';

// Mock prisma
vi.mock('../src/lib/prisma', () => ({
  prisma: {
    account: {
      findUnique: vi.fn(),
    },
    productVariant: {
      findUnique: vi.fn(),
    },
    journalEntry: {
      create: vi.fn(),
    },
  },
}));

// Mock journals service
vi.mock('../src/services/accounting/journals-service', () => ({
  createJournalEntry: vi.fn(),
}));

describe('Inventory Link Service Benchmark', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should demonstrate repeated DB calls', async () => {
    const mockProductVariant = {
      id: 'pv-1',
      name: 'Test Product',
      product: {
        productType: 'RAW_MATERIAL',
        inventoryAccountId: null,
        cogsAccountId: null,
        wipAccountId: null,
      },
      standardCost: 100,
    };

    const mockMovement = {
      id: 'mov-1',
      type: 'OUT' as MovementType,
      productVariantId: 'pv-1',
      quantity: 10,
      createdAt: new Date(),
      salesOrderId: 'so-1',
    } as any;

    const findUniqueSpy = vi.spyOn(prisma.account, 'findUnique').mockResolvedValue({
      id: 'acc-123',
      code: '12345',
    } as any);

    const start = performance.now();

    // Simulate batch processing
    const ITERATIONS = 1000;
    for (let i = 0; i < ITERATIONS; i++) {
        await recordInventoryMovement({
        ...mockMovement,
        productVariant: mockProductVariant,
        });
    }

    const end = performance.now();
    console.log(`Execution time for ${ITERATIONS} items: ${(end - start).toFixed(2)}ms`);
    console.log(`Total DB calls: ${findUniqueSpy.mock.calls.length}`);

    // With optimization, it should be cached
    // First iteration: 2 calls (misses). Subsequent: 0 calls (hits).
    expect(findUniqueSpy).toHaveBeenCalledTimes(2);
  });
});
