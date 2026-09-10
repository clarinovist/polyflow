import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    diagnoseProductionOrder,
    getProductionBriefing,
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
