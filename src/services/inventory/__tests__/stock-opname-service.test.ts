import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma, OpnameStatus, MovementType } from '@prisma/client';

const { mockPrisma, mockTx } = vi.hoisted(() => {
    const tx = {
        $queryRaw: vi.fn(),
        inventory: {
            upsert: vi.fn(),
            update: vi.fn(),
        },
        stockMovement: {
            create: vi.fn(),
        },
        stockOpname: {
            findUnique: vi.fn(),
            update: vi.fn(),
        },
        stockOpnameItem: {
            update: vi.fn(),
        },
        stockOpnameEntry: {
            groupBy: vi.fn(),
        },
    };

    return {
        mockTx: tx,
        mockPrisma: {
            $transaction: vi.fn(
                async (callback: (transaction: typeof tx) => Promise<unknown>) =>
                    callback(tx),
            ),
        },
    };
});

vi.mock('@/lib/core/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/services/accounting/accounting-service', () => ({
    AccountingService: { recordInventoryMovement: vi.fn() },
}));
vi.mock('@/lib/tools/audit', () => ({ logActivity: vi.fn() }));

import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import { logActivity } from '@/lib/tools/audit';
import { AccountingService } from '@/services/accounting/accounting-service';
import { StockOpnameService } from '../stock-opname-service';

const FINALIZED_AT = new Date('2026-10-02T03:00:00.000Z');
const EFFECTIVE_AT = new Date('2026-09-30T16:59:59.999Z');

function openOpname(
    overrides: Record<string, unknown> = {},
): Record<string, unknown> {
    return {
        id: 'opname-1',
        opnameNumber: 'OPN-202609-0001',
        locationId: 'loc-1',
        status: OpnameStatus.OPEN,
        createdAt: new Date('2026-09-15T03:00:00.000Z'),
        items: [
            {
                id: 'item-1',
                productVariantId: 'variant-1',
                systemQuantity: new Prisma.Decimal(110),
                countedQuantity: new Prisma.Decimal(100),
            },
        ],
        ...overrides,
    };
}

function mockRawQueries({
    live = '130',
    cutoff = '110',
    ledger = '130',
    period = 'OPEN',
    laterOpnames = [],
}: {
    live?: string;
    cutoff?: string;
    ledger?: string;
    period?: string;
    laterOpnames?: Array<{
        opnameNumber: string | null;
        effectiveDate: Date | null;
        completedAt: Date | null;
    }>;
} = {}) {
    mockTx.$queryRaw
        .mockResolvedValueOnce([{ id: 'opname-1' }])
        .mockResolvedValueOnce([{ status: period }])
        .mockResolvedValueOnce([
            {
                productVariantId: 'variant-1',
                quantity: live,
            },
        ])
        .mockResolvedValueOnce(laterOpnames)
        .mockResolvedValueOnce([
            {
                productVariantId: 'variant-1',
                cutoffQuantity: cutoff,
                ledgerQuantity: ledger,
            },
        ]);
}

describe('StockOpnameService.completeOpname', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(FINALIZED_AT);
        vi.clearAllMocks();
        mockTx.stockOpname.findUnique.mockResolvedValue(openOpname());
        mockTx.stockOpnameEntry.groupBy.mockResolvedValue([]);
        mockTx.stockMovement.create.mockImplementation(async ({ data }) => ({
            id: 'movement-1',
            ...data,
        }));
        mockTx.stockOpname.update.mockResolvedValue({ id: 'opname-1' });
        mockRawQueries();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('posts the cutoff variance as a delta so later stock movements remain intact', async () => {
        // Cutoff 30 Sep = 110, physical count = 100, live 2 Oct = 130.
        // Posting -10 must leave live stock at 120, not overwrite it to 100.
        await StockOpnameService.completeOpname(
            'opname-1',
            '2026-09-30',
            'user-1',
        );

        expect(mockTx.stockOpnameItem.update).toHaveBeenCalledWith({
            where: { id: 'item-1' },
            data: { systemQuantity: new Prisma.Decimal(110) },
        });
        expect(mockTx.inventory.upsert).toHaveBeenCalledWith({
            where: {
                locationId_productVariantId: {
                    locationId: 'loc-1',
                    productVariantId: 'variant-1',
                },
            },
            update: {
                quantity: { decrement: new Prisma.Decimal(10) },
            },
            create: {
                locationId: 'loc-1',
                productVariantId: 'variant-1',
                quantity: new Prisma.Decimal(120),
            },
        });
        expect(mockTx.stockMovement.create).toHaveBeenCalledWith({
            data: {
                type: MovementType.ADJUSTMENT,
                productVariantId: 'variant-1',
                fromLocationId: 'loc-1',
                toLocationId: null,
                quantity: new Prisma.Decimal(10),
                reference: 'OPN-202609-0001',
                createdById: 'user-1',
                createdAt: EFFECTIVE_AT,
            },
        });
        expect(AccountingService.recordInventoryMovement).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'movement-1',
                createdAt: EFFECTIVE_AT,
            }),
            mockTx,
        );
        expect(mockTx.stockOpname.update).toHaveBeenCalledWith({
            where: { id: 'opname-1' },
            data: {
                status: OpnameStatus.COMPLETED,
                effectiveDate: EFFECTIVE_AT,
                completedAt: FINALIZED_AT,
            },
        });
        expect(logActivity).toHaveBeenCalledWith({
            userId: 'user-1',
            action: 'COMPLETE_OPNAME',
            entityType: 'StockOpname',
            entityId: 'opname-1',
            details:
                'Completed opname for location loc-1; effective date 2026-09-30',
            tx: mockTx,
        });
        expect(mockPrisma.$transaction).toHaveBeenCalledWith(
            expect.any(Function),
            { timeout: 30_000, maxWait: 10_000 },
        );
    });

    it('uses the finalization instant for a current-day effective date', async () => {
        mockTx.$queryRaw.mockReset();
        mockRawQueries({ live: '110', cutoff: '110', ledger: '110' });

        await StockOpnameService.completeOpname(
            'opname-1',
            '2026-10-02',
            'user-1',
        );

        expect(mockTx.stockMovement.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ createdAt: FINALIZED_AT }),
        });
        expect(mockTx.stockOpname.update).toHaveBeenCalledWith({
            where: { id: 'opname-1' },
            data: expect.objectContaining({ effectiveDate: FINALIZED_AT }),
        });
    });

    it('uses entry sums as the physical count source of truth', async () => {
        mockTx.stockOpnameEntry.groupBy.mockResolvedValue([
            {
                opnameItemId: 'item-1',
                _sum: { quantity: new Prisma.Decimal('126.3') },
            },
        ]);
        mockTx.$queryRaw.mockReset();
        mockRawQueries({ live: '130', cutoff: '100', ledger: '130' });

        await StockOpnameService.completeOpname(
            'opname-1',
            '2026-09-30',
            'user-1',
        );

        expect(mockTx.inventory.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                update: {
                    quantity: { increment: new Prisma.Decimal('26.3') },
                },
            }),
        );
    });

    it('completes without a movement when the count matches the cutoff balance', async () => {
        mockTx.$queryRaw.mockReset();
        mockRawQueries({ live: '120', cutoff: '100', ledger: '120' });

        await StockOpnameService.completeOpname(
            'opname-1',
            '2026-09-30',
            'user-1',
        );

        expect(mockTx.inventory.upsert).not.toHaveBeenCalled();
        expect(mockTx.stockMovement.create).not.toHaveBeenCalled();
        expect(mockTx.stockOpname.update).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['2026/09/30', 'Tanggal efektif tidak valid'],
        ['2026-10-03', 'tidak boleh di masa depan'],
    ])('rejects invalid effective date %s', async (date, message) => {
        await expect(
            StockOpnameService.completeOpname('opname-1', date, 'user-1'),
        ).rejects.toThrow(message);
        expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('allows an earlier cutoff when a delayed opname session is entered later', async () => {
        mockTx.stockOpname.findUnique.mockResolvedValue(
            openOpname({ createdAt: new Date('2026-10-02T03:00:00.000Z') }),
        );

        await StockOpnameService.completeOpname(
            'opname-1',
            '2026-09-30',
            'user-1',
        );

        expect(mockTx.stockMovement.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ createdAt: EFFECTIVE_AT }),
        });
    });

    it('rejects a closed or missing fiscal period', async () => {
        mockTx.$queryRaw.mockReset();
        mockTx.$queryRaw
            .mockResolvedValueOnce([{ id: 'opname-1' }])
            .mockResolvedValueOnce([{ status: 'CLOSED' }]);

        await expect(
            StockOpnameService.completeOpname(
                'opname-1',
                '2026-09-30',
                'user-1',
            ),
        ).rejects.toMatchObject({ code: 'FISCAL_PERIOD_CLOSED' });
        expect(mockTx.stockMovement.create).not.toHaveBeenCalled();
    });

    it('rejects backdating across another completed opname for the location', async () => {
        mockTx.$queryRaw.mockReset();
        mockRawQueries({
            laterOpnames: [
                {
                    opnameNumber: 'OPN-202610-0002',
                    effectiveDate: new Date('2026-10-01T16:59:59.999Z'),
                    completedAt: FINALIZED_AT,
                },
            ],
        });

        await expect(
            StockOpnameService.completeOpname(
                'opname-1',
                '2026-09-30',
                'user-1',
            ),
        ).rejects.toThrow('sudah ada stock opname');
    });

    it('rejects finalization when live inventory and the all-time ledger disagree', async () => {
        mockTx.$queryRaw.mockReset();
        mockRawQueries({ live: '130', cutoff: '110', ledger: '129' });

        await expect(
            StockOpnameService.completeOpname(
                'opname-1',
                '2026-09-30',
                'user-1',
            ),
        ).rejects.toMatchObject({ code: 'OPNAME_LEDGER_MISMATCH' });
        expect(mockTx.inventory.upsert).not.toHaveBeenCalled();
    });

    it('rejects a backdated shortage that would make live stock negative', async () => {
        mockTx.stockOpname.findUnique.mockResolvedValue(
            openOpname({
                items: [
                    {
                        id: 'item-1',
                        productVariantId: 'variant-1',
                        countedQuantity: new Prisma.Decimal(0),
                    },
                ],
            }),
        );
        mockTx.$queryRaw.mockReset();
        mockRawQueries({ live: '5', cutoff: '20', ledger: '5' });

        await expect(
            StockOpnameService.completeOpname(
                'opname-1',
                '2026-09-30',
                'user-1',
            ),
        ).rejects.toMatchObject({ code: 'OPNAME_NEGATIVE_LIVE_STOCK' });
        expect(mockTx.inventory.upsert).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when the session lock finds no row', async () => {
        mockTx.$queryRaw.mockReset();
        mockTx.$queryRaw.mockResolvedValueOnce([]);

        await expect(
            StockOpnameService.completeOpname(
                'missing',
                '2026-09-30',
                'user-1',
            ),
        ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('rejects a session that is no longer open after obtaining its lock', async () => {
        mockTx.stockOpname.findUnique.mockResolvedValue(
            openOpname({ status: OpnameStatus.COMPLETED }),
        );

        await expect(
            StockOpnameService.completeOpname(
                'opname-1',
                '2026-09-30',
                'user-1',
            ),
        ).rejects.toBeInstanceOf(BusinessRuleError);
        expect(mockTx.stockMovement.create).not.toHaveBeenCalled();
    });
});
