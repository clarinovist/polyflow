import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    diagnoseProductionOrder,
    getProductionBriefing,
    getProductionOutputForBusinessDate,
    type ProductionReadClient,
} from '../assistant-production-query-service';

const tx = {
    productionOrder: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
    },
    location: { findMany: vi.fn() },
    inventory: { findMany: vi.fn() },
    stockReservation: { findMany: vi.fn() },
    productionExecution: { findMany: vi.fn() },
} as unknown as ProductionReadClient;

const productionOrder = tx.productionOrder as unknown as {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
};
const location = tx.location as unknown as {
    findMany: ReturnType<typeof vi.fn>;
};
const inventory = tx.inventory as unknown as {
    findMany: ReturnType<typeof vi.fn>;
};
const stockReservation = tx.stockReservation as unknown as {
    findMany: ReturnType<typeof vi.fn>;
};
const productionExecution = tx.productionExecution as unknown as {
    findMany: ReturnType<typeof vi.fn>;
};

const candidate = {
    id: 'order-1',
    orderNumber: 'SPK-001',
    status: 'IN_PROGRESS',
    bom: { productVariant: { product: { name: 'Produk A' } } },
};

describe('assistant production query service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        productionOrder.findUnique.mockResolvedValueOnce(candidate);
        stockReservation.findMany.mockResolvedValue([]);
        location.findMany.mockResolvedValue([
            {
                id: 'loc-rm',
                name: 'Gudang RM',
                slug: 'rm_warehouse',
                locationPurpose: 'RAW_MATERIAL',
            },
            {
                id: 'loc-scrap',
                name: 'Gudang Scrap',
                slug: 'scrap_warehouse',
                locationPurpose: 'SCRAP',
            },
        ]);
    });

    it('uses the persisted production material plan, issued quantity and eligible source stock', async () => {
        productionOrder.findUnique.mockResolvedValueOnce({
            plannedQuantity: 100,
            actualQuantity: 40,
            plannedStartDate: new Date('2026-09-01T00:00:00Z'),
            plannedEndDate: new Date('2026-09-10T00:00:00Z'),
            materialConsumptionMode: 'TRANSFER',
            machine: { name: 'Mesin 1' },
            issues: [{ category: 'MATERIAL', description: 'Menunggu resin' }],
            plannedMaterials: [
                {
                    productVariantId: 'pv-1',
                    quantity: 50,
                    sourceLocationId: 'loc-rm',
                    sourceLocation: { name: 'Gudang RM' },
                    productVariant: {
                        name: 'Resin A',
                        product: { name: 'Resin' },
                    },
                },
            ],
            materialIssues: [
                {
                    productVariantId: 'pv-1',
                    quantity: 20,
                    status: 'ISSUED',
                },
                {
                    productVariantId: 'pv-1',
                    quantity: 5,
                    status: 'STAGED',
                },
            ],
        });
        inventory.findMany.mockResolvedValue([
            { productVariantId: 'pv-1', locationId: 'loc-rm', quantity: 20 },
            {
                productVariantId: 'pv-1',
                locationId: 'loc-scrap',
                quantity: 100,
            },
        ]);
        stockReservation.findMany.mockResolvedValue([
            { productVariantId: 'pv-1', locationId: 'loc-rm', quantity: 5 },
        ]);

        const result = await diagnoseProductionOrder(tx, 'order-1');

        expect(result.kind).toBe('selected');
        expect(result.order?.materials[0]).toMatchObject({
            required: 50,
            issued: 25,
            remaining: 25,
            available: 10,
            shortage: 15,
            sourceLocation: 'Gudang RM',
        });
        expect(inventory.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    locationId: { in: ['loc-rm'] },
                }),
            }),
        );
    });

    it('returns candidates instead of silently selecting an ambiguous number', async () => {
        productionOrder.findUnique
            .mockReset()
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(null);
        productionOrder.findMany.mockResolvedValue([
            candidate,
            {
                ...candidate,
                id: 'order-2',
                orderNumber: 'SPK-001-A',
            },
        ]);

        const result = await diagnoseProductionOrder(tx, 'SPK-001');
        expect(result.kind).toBe('ambiguous');
        expect(result.candidates).toHaveLength(2);
        expect(location.findMany).not.toHaveBeenCalled();
    });

    it('marks material diagnosis partial when no persisted plan exists', async () => {
        productionOrder.findUnique.mockResolvedValueOnce({
            plannedQuantity: 10,
            actualQuantity: 0,
            plannedStartDate: new Date('2026-09-01T00:00:00Z'),
            plannedEndDate: null,
            materialConsumptionMode: 'TRANSFER',
            machine: null,
            issues: [],
            plannedMaterials: [],
            materialIssues: [],
        });

        const result = await diagnoseProductionOrder(tx, 'order-1');
        expect(result.order?.materialCheck).toBe('partial');
        expect(result.order?.materialCheckReason).toContain(
            'belum dapat dipastikan',
        );
        expect(inventory.findMany).not.toHaveBeenCalled();
        expect(stockReservation.findMany).not.toHaveBeenCalled();
    });

    it('aggregates actual daily output by process, product and unit within exact WIB bounds', async () => {
        productionExecution.findMany.mockResolvedValue([
            {
                productionOrderId: 'order-1',
                quantityProduced: new Prisma.Decimal('1.25'),
                scrapQuantity: new Prisma.Decimal(0),
                scrapProngkolQty: new Prisma.Decimal(0),
                scrapDaunQty: new Prisma.Decimal(0),
                endTime: null,
                productionOrder: {
                    bom: {
                        category: 'EXTRUSION',
                        productVariant: {
                            id: 'variant-kg',
                            name: 'Variant KG',
                            skuCode: 'KG-1',
                            primaryUnit: 'KG',
                            product: { name: 'Produk KG' },
                        },
                    },
                },
            },
            {
                productionOrderId: 'order-2',
                quantityProduced: new Prisma.Decimal('2.75'),
                scrapQuantity: new Prisma.Decimal(0),
                scrapProngkolQty: new Prisma.Decimal(0),
                scrapDaunQty: new Prisma.Decimal(0),
                endTime: new Date('2026-10-12T01:00:00.000Z'),
                productionOrder: {
                    bom: {
                        category: 'EXTRUSION',
                        productVariant: {
                            id: 'variant-kg',
                            name: 'Variant KG',
                            skuCode: 'KG-1',
                            primaryUnit: 'KG',
                            product: { name: 'Produk KG' },
                        },
                    },
                },
            },
            {
                productionOrderId: 'order-3',
                quantityProduced: new Prisma.Decimal('3'),
                scrapQuantity: new Prisma.Decimal(0),
                scrapProngkolQty: new Prisma.Decimal(0),
                scrapDaunQty: new Prisma.Decimal(0),
                endTime: new Date('2026-10-12T02:00:00.000Z'),
                productionOrder: {
                    bom: {
                        category: 'PACKING',
                        productVariant: {
                            id: 'variant-bal',
                            name: 'Variant BAL',
                            skuCode: 'BAL-1',
                            primaryUnit: 'BAL',
                            product: { name: 'Produk BAL' },
                        },
                    },
                },
            },
            {
                productionOrderId: 'order-4',
                quantityProduced: new Prisma.Decimal('5'),
                scrapQuantity: new Prisma.Decimal(0),
                scrapProngkolQty: new Prisma.Decimal(0),
                scrapDaunQty: new Prisma.Decimal(0),
                endTime: new Date('2026-10-12T03:00:00.000Z'),
                productionOrder: {
                    bom: {
                        category: 'PACKING',
                        productVariant: {
                            id: 'variant-kg-2',
                            name: 'Variant KG Packing',
                            skuCode: 'KG-2',
                            primaryUnit: 'KG',
                            product: { name: 'Produk KG Packing' },
                        },
                    },
                },
            },
        ]);

        const result = await getProductionOutputForBusinessDate(
            tx,
            '2026-10-12',
        );

        expect(productionExecution.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    status: { not: 'VOIDED' },
                    startTime: {
                        gte: new Date('2026-10-11T17:00:00.000Z'),
                        lte: new Date('2026-10-12T16:59:59.999Z'),
                    },
                },
            }),
        );
        expect(result).toMatchObject({
            date: '2026-10-12',
            entries: 4,
            orders: 4,
            totals: [
                { process: 'EXTRUSION', unit: 'KG', produced: '4' },
                { process: 'PACKING', unit: 'BAL', produced: '3' },
                { process: 'PACKING', unit: 'KG', produced: '5' },
            ],
        });
        expect(result.groups).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    process: 'EXTRUSION',
                    productVariantId: 'variant-kg',
                    unit: 'KG',
                    produced: '4',
                    entries: 2,
                    orders: 2,
                }),
            ]),
        );
        expect(result.totals).not.toContainEqual(
            expect.objectContaining({ produced: '12' }),
        );
    });

    it('excludes empty running shells without falling back to SPK targets', async () => {
        productionExecution.findMany.mockResolvedValue([
            {
                productionOrderId: 'order-1',
                quantityProduced: new Prisma.Decimal(0),
                scrapQuantity: new Prisma.Decimal(0),
                scrapProngkolQty: new Prisma.Decimal(0),
                scrapDaunQty: new Prisma.Decimal(0),
                endTime: null,
                productionOrder: {
                    bom: {
                        category: 'EXTRUSION',
                        productVariant: {
                            id: 'variant-kg',
                            name: 'Variant KG',
                            skuCode: 'KG-1',
                            primaryUnit: 'KG',
                            product: { name: 'Produk KG' },
                        },
                    },
                },
            },
        ]);

        await expect(
            getProductionOutputForBusinessDate(tx, '2026-10-12'),
        ).resolves.toEqual({
            date: '2026-10-12',
            entries: 0,
            orders: 0,
            groups: [],
            totals: [],
        });
        expect(productionOrder.findMany).not.toHaveBeenCalled();
    });

    it('retains running output, completed zero output, and scrap-only rows', async () => {
        const row = (overrides: Record<string, unknown>) => ({
            productionOrderId: 'order-1',
            quantityProduced: new Prisma.Decimal(0),
            scrapQuantity: new Prisma.Decimal(0),
            scrapProngkolQty: new Prisma.Decimal(0),
            scrapDaunQty: new Prisma.Decimal(0),
            endTime: null,
            productionOrder: {
                bom: {
                    category: 'EXTRUSION',
                    productVariant: {
                        id: 'variant-kg',
                        name: 'Variant KG',
                        skuCode: 'KG-1',
                        primaryUnit: 'KG',
                        product: { name: 'Produk KG' },
                    },
                },
            },
            ...overrides,
        });
        productionExecution.findMany.mockResolvedValue([
            row({ quantityProduced: new Prisma.Decimal(2) }),
            row({ endTime: new Date('2026-10-12T01:00:00.000Z') }),
            row({ scrapProngkolQty: new Prisma.Decimal(1) }),
        ]);

        const result = await getProductionOutputForBusinessDate(
            tx,
            '2026-10-12',
        );

        expect(result).toMatchObject({
            entries: 3,
            orders: 1,
            totals: [{ process: 'EXTRUSION', unit: 'KG', produced: '2' }],
        });
        expect(result.groups[0]).toMatchObject({
            produced: '2',
            entries: 3,
        });
    });

    it('returns a bounded briefing with deterministic database ordering and truncation', async () => {
        productionOrder.findMany.mockResolvedValue([
            {
                id: 'order-1',
                orderNumber: 'SPK-001',
                status: 'WAITING_MATERIAL',
                priority: 'URGENT',
                plannedQuantity: 100,
                actualQuantity: 20,
                plannedEndDate: new Date('2026-09-09T00:00:00Z'),
                machine: null,
                bom: { productVariant: { product: { name: 'Produk A' } } },
                _count: { issues: 2 },
            },
        ]);
        productionOrder.count.mockResolvedValue(22);

        const result = await getProductionBriefing(tx);
        expect(result).toMatchObject({ total: 22, truncated: true });
        expect(result.items[0]).toMatchObject({
            orderNumber: 'SPK-001',
            openIssueCount: 2,
        });
        expect(productionOrder.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                take: 20,
                orderBy: [
                    { plannedEndDate: { sort: 'asc', nulls: 'last' } },
                    { priority: 'asc' },
                    { orderNumber: 'asc' },
                ],
            }),
        );
    });
});
