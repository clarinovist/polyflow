import { beforeEach, describe, expect, it, vi } from 'vitest';

class FakeDecimal {
    constructor(private readonly value: number) { }

    sub(other: FakeDecimal) {
        return new FakeDecimal(this.value - other.value);
    }

    toNumber() {
        return this.value;
    }

    valueOf() {
        return this.value;
    }
}

const { mockPrisma, mockTx } = vi.hoisted(() => {
    const tx = {
        inventory: {
            upsert: vi.fn(),
        },
        stockMovement: {
            create: vi.fn(),
        },
        stockOpname: {
            update: vi.fn(),
        },
    };

    return {
        mockTx: tx,
        mockPrisma: {
            stockOpname: {
                findUnique: vi.fn(),
            },
            $transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
        }
    };
});

vi.mock('@/lib/core/prisma', () => ({
    prisma: mockPrisma,
}));

vi.mock('@/services/accounting/accounting-service', () => ({
    AccountingService: {
        recordInventoryMovement: vi.fn(),
    }
}));

vi.mock('@/lib/tools/audit', () => ({
    logActivity: vi.fn(),
}));

import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import { logActivity } from '@/lib/tools/audit';
import { AccountingService } from '@/services/accounting/accounting-service';
import { MovementType, OpnameStatus } from '@prisma/client';
import { StockOpnameService } from '../stock-opname-service';

describe('StockOpnameService.completeOpname', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockTx.stockMovement.create.mockResolvedValue({ id: 'movement-1' });
        mockTx.stockOpname.update.mockResolvedValue({ id: 'opname-1' });
    });

    it('closes an open opname session and posts adjustment movement for variance items', async () => {
        mockPrisma.stockOpname.findUnique.mockResolvedValue({
            id: 'opname-1',
            opnameNumber: 'OPN-202605-0001',
            locationId: 'loc-1',
            status: OpnameStatus.OPEN,
            items: [
                {
                    id: 'item-1',
                    productVariantId: 'variant-1',
                    systemQuantity: new FakeDecimal(7),
                    countedQuantity: new FakeDecimal(10),
                },
                {
                    id: 'item-2',
                    productVariantId: 'variant-2',
                    systemQuantity: new FakeDecimal(5),
                    countedQuantity: null,
                },
            ]
        });

        await StockOpnameService.completeOpname('opname-1', 'user-1');

        expect(mockPrisma.stockOpname.findUnique).toHaveBeenCalledWith({
            where: { id: 'opname-1' },
            include: { items: true }
        });
        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
        expect(mockTx.inventory.upsert).toHaveBeenCalledWith({
            where: {
                locationId_productVariantId: {
                    locationId: 'loc-1',
                    productVariantId: 'variant-1'
                }
            },
            update: { quantity: new FakeDecimal(10) },
            create: {
                locationId: 'loc-1',
                productVariantId: 'variant-1',
                quantity: new FakeDecimal(10)
            }
        });
        expect(mockTx.stockMovement.create).toHaveBeenCalledWith({
            data: {
                type: MovementType.ADJUSTMENT,
                productVariantId: 'variant-1',
                fromLocationId: null,
                toLocationId: 'loc-1',
                quantity: 3,
                reference: 'OPN-202605-0001',
            }
        });
        expect(AccountingService.recordInventoryMovement).toHaveBeenCalledWith({ id: 'movement-1' }, mockTx);
        expect(mockTx.stockOpname.update).toHaveBeenCalledWith({
            where: { id: 'opname-1' },
            data: {
                status: OpnameStatus.COMPLETED,
                completedAt: expect.any(Date),
            }
        });
        expect(logActivity).toHaveBeenCalledWith({
            userId: 'user-1',
            action: 'COMPLETE_OPNAME',
            entityType: 'StockOpname',
            entityId: 'opname-1',
            details: 'Completed opname for location loc-1',
            tx: mockTx,
        });
    });

    it('throws NotFoundError when opname session is missing', async () => {
        mockPrisma.stockOpname.findUnique.mockResolvedValue(null);

        await expect(StockOpnameService.completeOpname('missing', 'user-1')).rejects.toBeInstanceOf(NotFoundError);
        expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws BusinessRuleError when opname session is not open', async () => {
        mockPrisma.stockOpname.findUnique.mockResolvedValue({
            id: 'opname-1',
            status: OpnameStatus.COMPLETED,
            items: [],
        });

        await expect(StockOpnameService.completeOpname('opname-1', 'user-1')).rejects.toBeInstanceOf(BusinessRuleError);
        expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
});
