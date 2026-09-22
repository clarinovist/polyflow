import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import type {
    Bom,
    BomItem,
    Inventory,
    Location,
    ProductType,
    ProductionOrder,
    SalesOrder,
    SalesOrderItem,
} from '@prisma/client';
import { ProductionOrderService } from '../order-service';
import { ProductionService } from '../production-service';

type BomRow = Pick<Bom, 'id' | 'isActive' | 'category' | 'outputQuantity'> & {
    items: Pick<BomItem, 'productVariantId' | 'quantity'>[];
    productVariant: { product: { productType: ProductType } };
};
type LocationRow = Pick<
    Location,
    'id' | 'name' | 'slug' | 'locationPurpose' | 'locationType'
>;
type OrderRow = Pick<
    ProductionOrder,
    'id' | 'orderNumber' | 'status' | 'plannedQuantity'
>;
type SalesRow = Pick<
    SalesOrder,
    'sourceLocationId' | 'expectedDate' | 'orderType' | 'customerId'
>;

const db = vi.hoisted(() => {
    // Deliberately separate delegates: callback(outerPrisma) would hide escapes.
    function clientStub() {
        return {
            bom: {
                findUnique: vi.fn<(args: Prisma.BomFindUniqueArgs) => Promise<BomRow | null>>(),
                findFirst: vi.fn<(args: Prisma.BomFindFirstArgs) => Promise<BomRow | null>>(),
            },
            location: {
                findUnique: vi.fn<(args: Prisma.LocationFindUniqueArgs) => Promise<LocationRow | null>>(),
                findMany: vi.fn<(args: Prisma.LocationFindManyArgs) => Promise<LocationRow[]>>(),
            },
            productVariant: {
                findMany: vi.fn<(args: Prisma.ProductVariantFindManyArgs) => Promise<{
                    id: string;
                    product: { productType: ProductType };
                }[]>>(),
            },
            inventory: {
                findMany: vi.fn<(args: Prisma.InventoryFindManyArgs) => Promise<
                    Pick<Inventory, 'productVariantId' | 'locationId' | 'quantity'>[]
                >>(),
            },
            productionOrder: {
                create: vi.fn<(args: Prisma.ProductionOrderCreateArgs) => Promise<OrderRow>>(),
                findFirst: vi.fn<(args: Prisma.ProductionOrderFindFirstArgs) => Promise<Pick<OrderRow, 'orderNumber'> | null>>(),
                findMany: vi.fn<(args: Prisma.ProductionOrderFindManyArgs) => Promise<Pick<OrderRow, 'plannedQuantity'>[]>>(),
            },
            customer: { count: vi.fn<(args: Prisma.CustomerCountArgs) => Promise<number>>() },
            productionMaterial: {
                createMany: vi.fn<(args: Prisma.ProductionMaterialCreateManyArgs) => Promise<Prisma.BatchPayload>>(),
            },
            salesOrder: {
                findUnique: vi.fn<(args: Prisma.SalesOrderFindUniqueArgs) => Promise<SalesRow | null>>(),
            },
            salesOrderItem: {
                findFirst: vi.fn<(args: Prisma.SalesOrderItemFindFirstArgs) => Promise<
                    Pick<SalesOrderItem, 'quantity' | 'deliveredQty'> | null
                >>(),
            },
        };
    }

    return {
        outer: clientStub(),
        tx: clientStub(),
        transaction: vi.fn<(callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => Promise<unknown>>(),
    };
});

vi.mock('@/lib/core/prisma', () => ({
    prisma: { ...db.outer, $transaction: db.transaction },
}));
// Do not load unrelated facade dependency trees (execution, stock, costing).
// Both order subjects, numbering, location and material validators stay real.
vi.mock('../execution-service', () => ({ ProductionExecutionService: {} }));
vi.mock('../material-service', () => ({ ProductionMaterialService: {} }));
vi.mock('../cost-service', () => ({ ProductionCostService: {} }));
vi.mock('../issue-service', () => ({ ProductionIssueService: {} }));
vi.mock('../routing-execution-guard', () => ({
    assertMachineCapableForOrder: vi.fn(() => { throw new Error('Unexpected routing guard'); }),
    assertRoutedOrderCanStart: vi.fn(() => { throw new Error('Unexpected routing guard'); }),
    ensureRoutedOrderWipReservation: vi.fn(() => { throw new Error('Unexpected reservation'); }),
    syncProductionRunStatusFromOrders: vi.fn(() => { throw new Error('Unexpected run update'); }),
}));
vi.mock('@/lib/tools/audit', () => ({
    logActivity: vi.fn(() => { throw new Error('Unexpected audit write'); }),
}));

// The only ORM boundary cast: projections above are typed, but do not implement
// Prisma's generic delegates/PrismaPromise. No PrismaClient is instantiated.
const txClient = db.tx as unknown as Prisma.TransactionClient;
const now = new Date('2026-09-14T00:00:00.000Z');
const dueDate = new Date('2026-09-18T00:00:00.000Z');
const bom: BomRow = {
    id: 'bom-synthetic',
    isActive: true,
    category: 'PACKING',
    outputQuantity: new Prisma.Decimal(1),
    productVariant: { product: { productType: 'FINISHED_GOOD' } },
    items: [{ productVariantId: 'material-synthetic', quantity: new Prisma.Decimal(2) }],
};
const output: LocationRow = {
    id: 'output-synthetic',
    name: 'Synthetic Finished Goods',
    slug: 'synthetic-output',
    locationPurpose: 'FINISHED_GOOD',
    locationType: 'INTERNAL',
};
const source: LocationRow = {
    id: 'source-synthetic',
    name: 'Synthetic Raw Materials',
    slug: 'synthetic-source',
    locationPurpose: 'RAW_MATERIAL',
    locationType: 'INTERNAL',
};

function orderInput(
    overrides: Partial<Parameters<typeof ProductionOrderService.createOrder>[0]> = {},
): Parameters<typeof ProductionOrderService.createOrder>[0] {
    return {
        bomId: bom.id,
        plannedQuantity: 5,
        plannedStartDate: now,
        locationId: output.id,
        notes: '',
        isMaklon: false,
        estimatedConversionCost: 0,
        ...overrides,
    };
}

function splitInput(): Parameters<typeof ProductionService.splitOrdersFromSales>[0] {
    return {
        salesOrderId: 'sales-synthetic',
        productVariantId: 'finished-synthetic',
        userId: 'actor-synthetic',
        batches: [5, 7, 9].map((plannedQuantity, index) => ({
            plannedQuantity,
            plannedStartDate: new Date(now.getTime() + index * 86_400_000),
        })),
    };
}

function allowSalesLookups() {
    db.outer.bom.findFirst.mockResolvedValue(bom);
    db.outer.salesOrder.findUnique.mockResolvedValue({
        sourceLocationId: output.id,
        expectedDate: dueDate,
        orderType: 'MAKE_TO_ORDER',
        customerId: 'customer-synthetic',
    });
}

function expectNoOuterModelCalls(allowed: string[] = []) {
    for (const [model, delegate] of Object.entries(db.outer)) {
        for (const [method, mock] of Object.entries(delegate)) {
            if (!allowed.includes(`${model}.${method}`)) {
                expect(mock, `outer ${model}.${method}`).not.toHaveBeenCalled();
            }
        }
    }
}

function expectSalesLookupsOnly() {
    expect(db.outer.bom.findFirst).toHaveBeenCalledExactlyOnceWith({
        where: {
            productVariantId: 'finished-synthetic',
            isDefault: true,
            isActive: true,
        },
    });
    expect(db.outer.salesOrder.findUnique).toHaveBeenCalledExactlyOnceWith({
        where: { id: 'sales-synthetic' },
        select: {
            sourceLocationId: true,
            expectedDate: true,
            orderType: true,
            customerId: true,
        },
    });
    expectNoOuterModelCalls(['bom.findFirst', 'salesOrder.findUnique']);
}

describe('Production order facade and transaction boundaries', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(now);
        // Fail closed: only explicitly configured queries may succeed.
        for (const [scope, client] of Object.entries({ outer: db.outer, tx: db.tx })) {
            for (const [model, delegate] of Object.entries(client)) {
                for (const [method, mock] of Object.entries(delegate)) {
                    mock.mockRejectedValue(new Error(`Unexpected ${scope}.${model}.${method}`));
                }
            }
        }
        db.transaction.mockImplementation((callback) => callback(txClient));
        db.tx.bom.findUnique.mockResolvedValue(bom);
        db.tx.location.findUnique.mockResolvedValue(output);
        db.tx.location.findMany.mockResolvedValue([output, source]);
        db.tx.productVariant.findMany.mockResolvedValue([
            { id: 'material-synthetic', product: { productType: 'RAW_MATERIAL' } },
        ]);
        db.tx.inventory.findMany.mockResolvedValue([{
            productVariantId: 'material-synthetic',
            locationId: source.id,
            quantity: new Prisma.Decimal(1000),
        }]);
        db.tx.salesOrderItem.findFirst.mockResolvedValue({
            quantity: new Prisma.Decimal(40),
            deliveredQty: new Prisma.Decimal(5),
        });
        db.tx.productionOrder.findMany.mockResolvedValue([
            { plannedQuantity: new Prisma.Decimal(10) },
        ]);
        // Numbering is real; emulate just its last-number read, not DB rollback.
        db.tx.productionOrder.findFirst.mockImplementation(async () => {
            const previous = db.tx.productionOrder.create.mock.calls.at(-1);
            return previous ? { orderNumber: previous[0].data.orderNumber } : null;
        });
        db.tx.productionOrder.create.mockImplementation(async ({ data }) => ({
            id: `order-synthetic-${db.tx.productionOrder.create.mock.calls.length}`,
            orderNumber: data.orderNumber,
            plannedQuantity: new Prisma.Decimal(String(data.plannedQuantity)),
            status: data.status ?? 'DRAFT',
        }));
        db.tx.productionMaterial.createMany.mockResolvedValue({ count: 1 });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('uses a provided tx for guards, material reads and writes without opening a transaction', async () => {
        const result = await ProductionOrderService.createOrder(orderInput({
            orderNumber: 'WO-SYNTHETIC-EXPLICIT',
            items: [{ productVariantId: 'material-synthetic', quantity: 7 }],
            materialSourceLocationId: source.id,
        }), txClient);

        expect(db.tx).not.toBe(db.outer);
        expect(db.tx.productionOrder.create).not.toBe(db.outer.productionOrder.create);
        expect(db.transaction).not.toHaveBeenCalled();
        expect(result.orderNumber).toBe('WO-SYNTHETIC-EXPLICIT');
        expect(db.tx.bom.findUnique).toHaveBeenNthCalledWith(1, {
            where: { id: bom.id },
            select: { id: true, isActive: true, category: true },
        });
        expect(db.tx.inventory.findMany).toHaveBeenCalledOnce();
        expect(db.tx.productionOrder.create).toHaveBeenCalledExactlyOnceWith({
            data: expect.objectContaining({
                orderNumber: 'WO-SYNTHETIC-EXPLICIT',
                status: 'DRAFT',
                sourceLocation: { connect: { id: source.id } },
            }),
        });
        expect(db.tx.productionMaterial.createMany).toHaveBeenCalledExactlyOnceWith({
            data: [{ productionOrderId: result.id, productVariantId: 'material-synthetic', quantity: 7 }],
        });
        expect(db.tx.bom.findUnique.mock.invocationCallOrder[0])
            .toBeLessThan(db.tx.inventory.findMany.mock.invocationCallOrder[0]);
        expect(db.tx.inventory.findMany.mock.invocationCallOrder[0])
            .toBeLessThan(db.tx.productionOrder.create.mock.invocationCallOrder[0]);
        expect(db.tx.productionOrder.create.mock.invocationCallOrder[0])
            .toBeLessThan(db.tx.productionMaterial.createMany.mock.invocationCallOrder[0]);
        expectNoOuterModelCalls();
    });

    it('owns exactly one transaction when tx is omitted, including generated numbering and BOM materials', async () => {
        const result = await ProductionOrderService.createOrder(orderInput());

        expect(db.transaction).toHaveBeenCalledOnce();
        expect(db.tx.productionOrder.findFirst).toHaveBeenCalledExactlyOnceWith({
            where: { orderNumber: { startsWith: 'WO-260914-' } },
            orderBy: { orderNumber: 'desc' },
            select: { orderNumber: true },
        });
        expect(result.orderNumber).toBe('WO-260914-001');
        expect(db.tx.productionOrder.create).toHaveBeenCalledOnce();
        expect(db.tx.productionMaterial.createMany).toHaveBeenCalledExactlyOnceWith({
            data: [{ productionOrderId: result.id, productVariantId: 'material-synthetic', quantity: 10 }],
        });
        expectNoOuterModelCalls();
    });

    it.each([
        { label: 'missing', row: null, code: 'NOT_FOUND' },
        { label: 'inactive', row: { ...bom, isActive: false }, code: 'BOM_INACTIVE' },
    ])('rejects a $label BOM before downstream guards or writes on the provided tx', async ({ row, code }) => {
        db.tx.bom.findUnique.mockResolvedValue(row);

        await expect(ProductionOrderService.createOrder(orderInput({
            materialConsumptionMode: 'DIRECT',
            items: [{ productVariantId: 'material-synthetic', quantity: 7, sourceLocationId: source.id }],
        }), txClient)).rejects.toMatchObject({ code });

        expect(db.tx.bom.findUnique).toHaveBeenCalledOnce();
        expect(db.tx.location.findUnique).not.toHaveBeenCalled();
        expect(db.tx.location.findMany).not.toHaveBeenCalled();
        expect(db.tx.productVariant.findMany).not.toHaveBeenCalled();
        expect(db.tx.inventory.findMany).not.toHaveBeenCalled();
        expect(db.tx.productionOrder.findFirst).not.toHaveBeenCalled();
        expect(db.tx.productionOrder.create).not.toHaveBeenCalled();
        expect(db.tx.productionMaterial.createMany).not.toHaveBeenCalled();
        expect(db.transaction).not.toHaveBeenCalled();
        expectNoOuterModelCalls();
    });

    it('creates deduplicated customer destinations in the same transaction', async () => {
        db.tx.customer.count.mockResolvedValue(2);
        await ProductionOrderService.createOrder(orderInput({ customerIds: ['a', 'b', 'a'] }));
        expect(db.tx.customer.count).toHaveBeenCalledWith({ where: { id: { in: ['a', 'b'] } } });
        expect(db.tx.productionOrder.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
            customerDestinations: { create: [
                { customer: { connect: { id: 'a' } } },
                { customer: { connect: { id: 'b' } } },
            ] },
        }) }));
        expect(db.outer.customer.count).not.toHaveBeenCalled();
    });

    it('rejects nonlocal customer destinations before creating the order', async () => {
        db.tx.customer.count.mockResolvedValue(0);
        await expect(ProductionOrderService.createOrder(orderInput({ customerIds: ['foreign'] }))).rejects.toThrow('tenant');
        expect(db.tx.productionOrder.create).not.toHaveBeenCalled();
    });

    it('keeps facade this.createOrder wiring when creating from a sales shortage', async () => {
        allowSalesLookups();
        // Spy only: no mock implementation/result, so the actual order service runs.
        const create = vi.spyOn(ProductionService, 'createOrder');

        const result = await ProductionService.createOrderFromSales(
            'sales-synthetic', 'finished-synthetic', 5,
        );

        expect(create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
            bomId: bom.id,
            salesOrderId: 'sales-synthetic',
            locationId: output.id,
            plannedQuantity: 5,
            plannedStartDate: now,
            plannedEndDate: dueDate,
            isMaklon: false,
        }));
        expect(create.mock.contexts[0]).toBe(ProductionService);
        expect(db.transaction).toHaveBeenCalledOnce();
        expect(db.tx.productionOrder.create).toHaveBeenCalledOnce();
        expect(db.tx.productionMaterial.createMany).toHaveBeenCalledOnce();
        expect(result.orderNumber).toBe('WO-260914-001');
        expectSalesLookupsOnly();
    });

    it('creates all split children through the facade using the same callback tx', async () => {
        allowSalesLookups();
        const create = vi.spyOn(ProductionService, 'createOrder');
        const input = splitInput();

        const results = await ProductionService.splitOrdersFromSales(input);

        expect(results).toHaveLength(3);
        expect(db.transaction).toHaveBeenCalledOnce();
        expect(create).toHaveBeenCalledTimes(3);
        expect(db.tx.salesOrderItem.findFirst).toHaveBeenCalledExactlyOnceWith({
            where: { salesOrderId: input.salesOrderId, productVariantId: input.productVariantId },
        });
        expect(db.tx.productionOrder.findMany).toHaveBeenCalledExactlyOnceWith({
            where: {
                salesOrderId: input.salesOrderId,
                bom: { productVariantId: input.productVariantId },
                status: { not: 'CANCELLED' },
            },
            select: { plannedQuantity: true },
        });
        expect(db.tx.productionOrder.findMany.mock.invocationCallOrder[0])
            .toBeLessThan(create.mock.invocationCallOrder[0]);
        expect(db.tx.productionOrder.create).toHaveBeenCalledTimes(3);
        expect(db.tx.productionMaterial.createMany).toHaveBeenCalledTimes(3);
        for (const [index, batch] of input.batches.entries()) {
            expect(create.mock.calls[index][1]).toBe(txClient);
            expect(create.mock.contexts[index]).toBe(ProductionService);
            expect(create).toHaveBeenNthCalledWith(index + 1, expect.objectContaining({
                bomId: bom.id,
                salesOrderId: input.salesOrderId,
                plannedQuantity: batch.plannedQuantity,
                plannedStartDate: batch.plannedStartDate,
                userId: input.userId,
            }), txClient);
            expect(results[index].plannedQuantity.toNumber()).toBe(batch.plannedQuantity);
            expect(results[index].orderNumber).toBe(`WO-260914-00${index + 1}`);
            expect(db.tx.productionMaterial.createMany).toHaveBeenNthCalledWith(index + 1, {
                data: [{
                    productionOrderId: results[index].id,
                    productVariantId: 'material-synthetic',
                    quantity: batch.plannedQuantity * 2,
                }],
            });
        }
        expectSalesLookupsOnly();
    });

    it('rejects excessive split demand inside tx before creating any child', async () => {
        allowSalesLookups();
        const create = vi.spyOn(ProductionService, 'createOrder');
        // Remaining: 40 ordered - 5 delivered - 20 already planned = 15 < 21.
        db.tx.productionOrder.findMany.mockResolvedValue([{ plannedQuantity: new Prisma.Decimal(20) }]);

        await expect(ProductionService.splitOrdersFromSales(splitInput())).rejects.toMatchObject({
            code: 'EXCEEDS_REMAINING_DEMAND',
            details: { sumBatchQty: 21, remainingToProduce: 15 },
        });

        expect(db.transaction).toHaveBeenCalledOnce();
        expect(db.tx.salesOrderItem.findFirst).toHaveBeenCalledOnce();
        expect(db.tx.productionOrder.findMany).toHaveBeenCalledOnce();
        expect(create).not.toHaveBeenCalled();
        expect(db.tx.bom.findUnique).not.toHaveBeenCalled();
        expect(db.tx.productionOrder.findFirst).not.toHaveBeenCalled();
        expect(db.tx.productionOrder.create).not.toHaveBeenCalled();
        expect(db.tx.productionMaterial.createMany).not.toHaveBeenCalled();
        expectSalesLookupsOnly();
    });

    it('propagates a second child write failure without material writes for it or a third child', async () => {
        allowSalesLookups();
        const create = vi.spyOn(ProductionService, 'createOrder');
        const failure = new Error('Synthetic second child write failure');
        db.tx.productionOrder.create
            .mockResolvedValueOnce({
                id: 'order-synthetic-1',
                orderNumber: 'WO-260914-001',
                plannedQuantity: new Prisma.Decimal(5),
                status: 'DRAFT',
            })
            .mockRejectedValueOnce(failure);

        await expect(ProductionService.splitOrdersFromSales(splitInput())).rejects.toBe(failure);

        expect(db.transaction).toHaveBeenCalledOnce();
        expect(create).toHaveBeenCalledTimes(2);
        expect(create.mock.calls.map(([data]) => data.plannedQuantity)).toEqual([5, 7]);
        for (const [, client] of create.mock.calls) expect(client).toBe(txClient);
        expect(db.tx.productionOrder.create).toHaveBeenCalledTimes(2);
        expect(db.tx.productionOrder.findFirst).toHaveBeenCalledTimes(2);
        expect(db.tx.productionMaterial.createMany).toHaveBeenCalledExactlyOnceWith({
            data: [{ productionOrderId: 'order-synthetic-1', productVariantId: 'material-synthetic', quantity: 10 }],
        });
        expect(db.tx.productionMaterial.createMany.mock.invocationCallOrder[0])
            .toBeLessThan(db.tx.productionOrder.create.mock.invocationCallOrder[1]);
        expectSalesLookupsOnly();
        // These are attempted calls and error propagation, not proof that a DB
        // rolled back the first child: this harness has no persistence/rollback.
    });

    it.each([
        { mode: 'DIRECT' as const, status: 'WAITING_MATERIAL' },
        { mode: 'TRANSFER' as const, status: 'DRAFT' },
    ])('$mode keeps its source-binding behavior on the provided tx', async ({ mode, status }) => {
        const alternative: LocationRow = { ...source, id: 'alternative-synthetic', slug: 'synthetic-alternative' };
        db.tx.location.findMany.mockResolvedValue(mode === 'DIRECT' ? [source] : [source, alternative, output]);
        // Stock exists only at a different warehouse than the explicitly chosen
        // source. DIRECT's pair-filtered query therefore returns no stock rows.
        db.tx.inventory.findMany.mockResolvedValue(mode === 'DIRECT' ? [] : [{
            productVariantId: 'material-synthetic',
            locationId: alternative.id,
            quantity: new Prisma.Decimal(1000),
        }]);

        const result = await ProductionOrderService.createOrder(orderInput({
            materialConsumptionMode: mode,
            materialSourceLocationId: source.id,
            items: [{ productVariantId: 'material-synthetic', quantity: 7, sourceLocationId: source.id }],
        }), txClient);

        expect(result.status).toBe(status);
        expect(db.transaction).not.toHaveBeenCalled();
        expect(db.tx.inventory.findMany).toHaveBeenCalledExactlyOnceWith(mode === 'DIRECT' ? {
            where: { OR: [{ productVariantId: 'material-synthetic', locationId: source.id }] },
            select: { productVariantId: true, locationId: true, quantity: true },
        } : {
            where: { productVariantId: { in: ['material-synthetic'] }, quantity: { gt: 0 } },
            select: { productVariantId: true, locationId: true, quantity: true },
        });
        expect(db.tx.productionMaterial.createMany).toHaveBeenCalledExactlyOnceWith({
            data: [{
                productionOrderId: result.id,
                productVariantId: 'material-synthetic',
                quantity: 7,
                ...(mode === 'DIRECT' ? { sourceLocationId: source.id } : {}),
            }],
        });
        expectNoOuterModelCalls();
    });
});
