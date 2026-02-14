/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InventoryService } from '../inventory-service';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

// Mock next-auth to prevent "destructure property of undefined" error
vi.mock('next-auth', () => {
    const auth = vi.fn();
    const handlers = { GET: vi.fn(), POST: vi.fn() };
    const signIn = vi.fn();
    const signOut = vi.fn();
    return {
        default: vi.fn(() => ({ auth, handlers, signIn, signOut })),
        getServerSession: vi.fn(),
    };
});

vi.mock('next-auth/providers/credentials', () => ({ default: vi.fn() }));
vi.mock('next-auth/jwt', () => ({ getToken: vi.fn() }));
vi.mock('next-auth/react', () => ({ useSession: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }));

// Mock Prisma
vi.mock('@/lib/prisma', () => ({
    prisma: {
        $queryRaw: vi.fn(),
        productVariant: { findUnique: vi.fn() },
        location: { findUnique: vi.fn() },
        stockReservation: { aggregate: vi.fn() },
        inventory: {
            findFirst: vi.fn(),
            update: vi.fn(),
            upsert: vi.fn(),
        },
        stockMovement: {
            create: vi.fn(),
        },
    },
}));

// Mock Audit
vi.mock('@/lib/audit', () => ({
    logActivity: vi.fn(),
}));

// Mock Analytics Service - use absolute path to catch it
vi.mock('@/services/inventory/analytics-service', () => ({
    getInventoryAsOf: vi.fn(),
    getStockHistory: vi.fn(),
    getInventoryTurnover: vi.fn(),
    getDaysOfInventoryOnHand: vi.fn(),
    getStockMovementTrends: vi.fn(),
}));

// Mock Stock Ledger Service
vi.mock('@/services/inventory/stock-ledger-service', () => ({
    getStockLedger: vi.fn(),
}));

// Mock Auto Journal Service
vi.mock('@/services/finance/auto-journal-service', () => ({
    AutoJournalService: {
        createInventoryJournal: vi.fn(),
    },
}));

describe('InventoryService', () => {
    const mockTx = prisma as unknown as Prisma.TransactionClient;
    const locationId = 'loc-123';
    const productVariantId = 'var-123';



    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('validateAndLockStock', () => {
        it('should pass given sufficient stock and no reservations', async () => {
            // 1. Mock $queryRaw for stockRow (returns array of { quantity: string })
            vi.mocked(prisma.$queryRaw).mockResolvedValue([{ quantity: '100' }]);

            // 2. Mock stockReservation.aggregate (returns _sum)
            vi.mocked(prisma.stockReservation.aggregate).mockResolvedValue({
                _sum: { quantity: { toNumber: () => 0 } }
            } as any);

            await expect(
                InventoryService.validateAndLockStock(mockTx, locationId, productVariantId, 10)
            ).resolves.not.toThrow();

            // Verify $queryRaw called
            expect(prisma.$queryRaw).toHaveBeenCalled();
        });

        it('should throw error if physical stock is insufficient', async () => {
            // Mock low stock
            vi.mocked(prisma.$queryRaw).mockResolvedValue([{ quantity: '5' }]);

            // Mock details for error message
            vi.mocked(prisma.productVariant.findUnique).mockResolvedValue({ name: 'Item A', primaryUnit: 'PCS' } as any);
            vi.mocked(prisma.location.findUnique).mockResolvedValue({ name: 'Warehouse A' } as any);

            await expect(
                InventoryService.validateAndLockStock(mockTx, locationId, productVariantId, 10)
            ).rejects.toThrow(/Insufficient physical stock/i);
        });

        it('should throw error if reservations reduce available stock below required', async () => {
            // Mock sufficient physical stock
            vi.mocked(prisma.$queryRaw).mockResolvedValue([{ quantity: '20' }]);

            // Mock high reservations (15 reserved, so only 5 available)
            vi.mocked(prisma.stockReservation.aggregate).mockResolvedValue({
                _sum: { quantity: { toNumber: () => 15 } }
            } as any);

            // Mock details for error message
            vi.mocked(prisma.productVariant.findUnique).mockResolvedValue({ name: 'Item A', primaryUnit: 'PCS' } as any);
            vi.mocked(prisma.location.findUnique).mockResolvedValue({ name: 'Warehouse A' } as any);

            await expect(
                InventoryService.validateAndLockStock(mockTx, locationId, productVariantId, 10)
            ).rejects.toThrow(/Stock is reserved/i);
        });
    });

    describe('incrementStock', () => {
        it('should upsert inventory', async () => {
            const quantity = 50;

            await InventoryService.incrementStock(mockTx, locationId, productVariantId, quantity);

            // Verify inventory upsert
            expect(prisma.inventory.upsert).toHaveBeenCalledWith(expect.objectContaining({
                where: {
                    locationId_productVariantId: { locationId, productVariantId }
                },
                create: {
                    locationId,
                    productVariantId,
                    quantity
                },
                update: {
                    quantity: { increment: quantity }
                }
            }));
        });
    });

    describe('deductStock', () => {
        it('should update inventory decrement', async () => {
            const quantity = 20;

            await InventoryService.deductStock(mockTx, locationId, productVariantId, quantity);

            expect(prisma.inventory.update).toHaveBeenCalledWith(expect.objectContaining({
                where: {
                    locationId_productVariantId: { locationId, productVariantId }
                },
                data: {
                    quantity: { decrement: quantity }
                }
            }));
        });
    });
});
