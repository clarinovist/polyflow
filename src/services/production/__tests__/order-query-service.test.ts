import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import type {
    AppSetting,
    Bom,
    BomItem,
    Customer,
    Employee,
    Inventory,
    Location,
    Machine,
    Product,
    ProductVariant,
    WorkShift,
} from '@prisma/client';
import { ProductionOrderService } from '../order-service';
import { ProductionService } from '../production-service';

type ProductRow = Pick<Product, 'id' | 'name' | 'productType'>;
type VariantRow = Pick<ProductVariant, 'id' | 'name' | 'primaryUnit'> & {
    product: ProductRow;
};
type BomItemRow = Pick<BomItem, 'productVariantId' | 'quantity'> & {
    productVariant: VariantRow;
};
type BomRow = Pick<Bom, 'id' | 'isActive' | 'outputQuantity'> & {
    productVariant: VariantRow;
    items: BomItemRow[];
};
type LocationRow = Pick<Location, 'id' | 'name' | 'slug' | 'locationPurpose'>;
type InventoryRow = Pick<Inventory, 'productVariantId' | 'locationId' | 'quantity'>;
type EmployeeRow = Pick<Employee, 'id' | 'name' | 'role' | 'status'>;

const db = vi.hoisted(() => ({
    bom: {
        findMany: vi.fn<(args: Prisma.BomFindManyArgs) => Promise<BomRow[]>>(),
        findUnique: vi.fn<(args: Prisma.BomFindUniqueArgs) => Promise<BomRow | null>>(),
    },
    machine: {
        findMany: vi.fn<(args: Prisma.MachineFindManyArgs) => Promise<Pick<Machine, 'id' | 'status'>[]>>(),
    },
    location: {
        findMany: vi.fn<(args: Prisma.LocationFindManyArgs) => Promise<LocationRow[]>>(),
    },
    employee: {
        findMany: vi.fn<(args: Prisma.EmployeeFindManyArgs) => Promise<EmployeeRow[]>>(),
    },
    workShift: {
        findMany: vi.fn<(args: Prisma.WorkShiftFindManyArgs) => Promise<Pick<WorkShift, 'id' | 'status' | 'startTime'>[]>>(),
    },
    productVariant: {
        findMany: vi.fn<(args: Prisma.ProductVariantFindManyArgs) => Promise<VariantRow[]>>(),
    },
    inventory: {
        findMany: vi.fn<(args: Prisma.InventoryFindManyArgs) => Promise<InventoryRow[]>>(),
    },
    customer: {
        findMany: vi.fn<(args: Prisma.CustomerFindManyArgs) => Promise<Pick<Customer, 'id' | 'name'>[]>>(),
    },
    appSetting: {
        findUnique: vi.fn<(args: Prisma.AppSettingFindUniqueArgs) => Promise<Pick<AppSetting, 'key' | 'value'> | null>>(),
    },
}));

// Mock only the database boundary. Both entry points, the material-source
// resolver, machine-map parser, and all facade dependencies remain real.
vi.mock('@/lib/core/prisma', () => ({ prisma: db }));

const queries = Object.values(db).flatMap((delegate) => Object.values(delegate));
const moduleLoadCallCounts = queries.map((query) => query.mock.calls.length);
const decimal = (value: number) => new Prisma.Decimal(value);
const raw: VariantRow = {
    id: 'raw-synthetic', name: 'Synthetic Resin', primaryUnit: 'KG',
    product: { id: 'raw-product-synthetic', name: 'Synthetic Raw Product', productType: 'RAW_MATERIAL' },
};
const wrap: VariantRow = {
    id: 'wrap-synthetic', name: 'Synthetic Wrap', primaryUnit: 'PCS',
    product: { id: 'wrap-product-synthetic', name: 'Synthetic Supply', productType: 'AUXILIARY' },
};
const locations: LocationRow[] = [
    { id: 'fg-synthetic', name: 'A Synthetic Output', slug: 'synthetic-fg', locationPurpose: 'FINISHED_GOOD' },
    { id: 'raw-store-synthetic', name: 'B Synthetic Raw Store', slug: 'synthetic-raw', locationPurpose: 'RAW_MATERIAL' },
    { id: 'supply-store-synthetic', name: 'C Synthetic Packaging Supply', slug: 'synthetic-packaging-supply', locationPurpose: 'PACKING' },
    { id: 'scrap-synthetic', name: 'D Synthetic Scrap', slug: 'synthetic-scrap', locationPurpose: 'SCRAP' },
    { id: 'inactive-synthetic', name: 'E Synthetic Retired Store', slug: 'inactive-synthetic', locationPurpose: 'RAW_MATERIAL' },
];
const [output, rawStore, supplyStore, scrap, inactive] = locations;

function item(variant: VariantRow, quantity: number): BomItemRow {
    return { productVariantId: variant.id, quantity: decimal(quantity), productVariant: variant };
}

function recipe(items: BomItemRow[] = [item(raw, 2.5), item(wrap, 4)]): BomRow {
    return {
        id: 'bom-synthetic', isActive: true, outputQuantity: decimal(2),
        productVariant: raw, items,
    };
}

function stock(variant: VariantRow, location: LocationRow, quantity: number): InventoryRow {
    return { productVariantId: variant.id, locationId: location.id, quantity: decimal(quantity) };
}

function noQueriesCalled() {
    for (const query of queries) expect(query).not.toHaveBeenCalled();
}

function expectPreviewQueries(variantIds: string[]) {
    expect(db.bom.findUnique).toHaveBeenCalledExactlyOnceWith({
        where: { id: 'bom-synthetic' },
        include: { items: { include: { productVariant: { include: { product: true } } } } },
    });
    expect(db.location.findMany).toHaveBeenCalledExactlyOnceWith({
        select: { id: true, name: true, slug: true, locationPurpose: true },
        orderBy: { name: 'asc' },
    });
    expect(db.inventory.findMany).toHaveBeenCalledExactlyOnceWith({
        where: { productVariantId: { in: variantIds }, quantity: { gt: 0 } },
        select: { productVariantId: true, locationId: true, quantity: true },
    });
    expect(db.bom.findUnique.mock.invocationCallOrder[0]).toBeLessThan(
        db.location.findMany.mock.invocationCallOrder[0],
    );
    expect(db.location.findMany.mock.invocationCallOrder[0]).toBeLessThan(
        db.inventory.findMany.mock.invocationCallOrder[0],
    );
}

it('does not query the database while importing the service or facade', () => {
    expect(moduleLoadCallCounts).toEqual(queries.map(() => 0));
    expect(ProductionService.getInitData).toBe(ProductionOrderService.getInitData);
    expect(ProductionService.getBomWithInventory).toBe(ProductionOrderService.getBomWithInventory);
});

describe.each([
    ['ProductionOrderService', ProductionOrderService],
    ['ProductionService facade', ProductionService],
] as const)('%s query characterization', (_name, subject) => {
    beforeEach(() => {
        vi.resetAllMocks();
        db.bom.findMany.mockResolvedValue([]);
        db.bom.findUnique.mockResolvedValue(recipe());
        db.machine.findMany.mockResolvedValue([]);
        db.location.findMany.mockResolvedValue(locations);
        db.employee.findMany.mockResolvedValue([]);
        db.workShift.findMany.mockResolvedValue([]);
        db.productVariant.findMany.mockResolvedValue([]);
        db.inventory.findMany.mockResolvedValue([]);
        db.customer.findMany.mockResolvedValue([]);
        db.appSetting.findUnique.mockResolvedValue(null);
    });

    it('preserves init predicates, ordering, row identity, role selection including PACKER, and machine overrides', async () => {
        const boms = [recipe()];
        const machines: Pick<Machine, 'id' | 'status'>[] = [{ id: 'machine-synthetic', status: 'ACTIVE' }];
        const employees: EmployeeRow[] = [
            { id: 'helper-synthetic', name: 'A Synthetic Helper', role: 'HELPER', status: 'ACTIVE' },
            { id: 'operator-synthetic', name: 'B Synthetic Operator', role: 'OPERATOR', status: 'ACTIVE' },
            { id: 'packer-synthetic', name: 'C Synthetic Packer', role: 'PACKER', status: 'ACTIVE' },
            { id: 'manager-synthetic', name: 'D Synthetic Manager', role: 'MANAGER', status: 'ACTIVE' },
            { id: 'inactive-operator-synthetic', name: 'E Synthetic Operator', role: 'OPERATOR', status: 'INACTIVE' },
        ];
        const shifts: Pick<WorkShift, 'id' | 'status' | 'startTime'>[] = [
            { id: 'shift-synthetic', status: 'ACTIVE', startTime: '08:00' },
        ];
        const materials = [raw, wrap];
        const inventory = [stock(raw, rawStore, 30)];
        const customers = [{ id: 'customer-synthetic', name: 'Synthetic Customer' }];
        db.bom.findMany.mockResolvedValue(boms);
        db.machine.findMany.mockResolvedValue(machines);
        db.employee.findMany.mockResolvedValue(employees);
        db.workShift.findMany.mockResolvedValue(shifts);
        db.productVariant.findMany.mockResolvedValue(materials);
        db.inventory.findMany.mockResolvedValue(inventory);
        db.customer.findMany.mockResolvedValue(customers);
        db.appSetting.findUnique.mockResolvedValue({
            key: 'production.machineStageMap',
            value: JSON.stringify({ PACKING: ['REWINDER', 'INVALID'], MIXING: ['MIXER'], UNKNOWN: ['PACKER'] }),
        });

        const result = await subject.getInitData();

        expect(db.bom.findMany).toHaveBeenCalledExactlyOnceWith({
            where: { isActive: true },
            include: { productVariant: { include: { product: true } } },
        });
        expect(db.machine.findMany).toHaveBeenCalledExactlyOnceWith({ where: { status: 'ACTIVE' } });
        expect(db.location.findMany).toHaveBeenCalledExactlyOnceWith({ orderBy: { name: 'asc' } });
        // Employee status is deliberately not filtered by this existing API.
        expect(db.employee.findMany).toHaveBeenCalledExactlyOnceWith({ orderBy: { name: 'asc' } });
        expect(db.workShift.findMany).toHaveBeenCalledExactlyOnceWith({
            where: { status: 'ACTIVE' }, orderBy: { startTime: 'asc' },
        });
        const issuable = ['RAW_MATERIAL', 'PACKAGING', 'AUXILIARY', 'INTERMEDIATE', 'WIP'];
        expect(db.productVariant.findMany).toHaveBeenCalledExactlyOnceWith({
            where: { archivedAt: null, product: { productType: { in: issuable } } },
            include: { product: true }, orderBy: { name: 'asc' },
        });
        expect(db.inventory.findMany).toHaveBeenCalledExactlyOnceWith({
            where: {
                productVariant: { product: { productType: { in: issuable } } },
                quantity: { gt: 0 },
            },
            select: { productVariantId: true, locationId: true, quantity: true },
        });
        expect(db.customer.findMany).toHaveBeenCalledExactlyOnceWith({ orderBy: { name: 'asc' } });
        expect(db.appSetting.findUnique).toHaveBeenCalledExactlyOnceWith({
            where: { key: 'production.machineStageMap' },
        });
        expect(result).toEqual({
            boms, machines, locations, operators: [employees[1], employees[4]],
            helpers: [employees[0], employees[2]], workShifts: shifts,
            rawMaterials: materials, rawMaterialStock: inventory, customers,
            machineStageMap: { PACKING: ['REWINDER'], MIXING: ['MIXER'] },
        });
        expect(result.boms).toBe(boms);
        expect(result.rawMaterialStock).toBe(inventory);
        expect(result.operators[0]).toBe(employees[1]);
        expect(result.helpers[1]).toBe(employees[2]);
    });

    it.each([null, '', '{invalid-json', '[]'])('returns empty role lists and map for absent/malformed setting %j', async (value) => {
        db.appSetting.findUnique.mockResolvedValue(
            value === null ? null : { key: 'production.machineStageMap', value },
        );
        const result = await subject.getInitData();
        expect(result.operators).toEqual([]);
        expect(result.helpers).toEqual([]);
        expect(result.machineStageMap).toEqual({});
    });

    it('launches all init queries even when one rejects, preserving the original DB error', async () => {
        const failure = new Error('synthetic init read failure');
        db.bom.findMany.mockRejectedValue(failure);
        await expect(subject.getInitData()).rejects.toBe(failure);
        for (const query of queries) {
            if (query !== db.bom.findUnique) expect(query).toHaveBeenCalledTimes(1);
        }
        expect(db.bom.findUnique).not.toHaveBeenCalled();
    });

    it.each([
        { bomId: '', quantity: 1 },
        { bomId: 'bom-synthetic', quantity: 0 },
        { bomId: 'bom-synthetic', quantity: -1 },
    ])('returns Invalid parameters Err before queries for $bomId / $quantity', async ({ bomId, quantity }) => {
        expect(await subject.getBomWithInventory(bomId, output.id, quantity)).toEqual({
            ok: false, error: new Error('Invalid parameters'),
        });
        noQueriesCalled();
    });

    it('returns Recipe not found Err without resolving material sources', async () => {
        db.bom.findUnique.mockResolvedValue(null);
        expect(await subject.getBomWithInventory('bom-synthetic', output.id, 3)).toEqual({
            ok: false, error: new Error('Recipe not found'),
        });
        expect(db.bom.findUnique).toHaveBeenCalledTimes(1);
        expect(db.location.findMany).not.toHaveBeenCalled();
        expect(db.inventory.findMany).not.toHaveBeenCalled();
    });

    it('calculates decimal requirements, per-source stock and eligible totals without a mixed-source suggestion', async () => {
        db.inventory.findMany.mockResolvedValue([
            stock(raw, rawStore, 10), stock(raw, output, 1),
            stock(raw, scrap, 999), stock(raw, inactive, 999),
            stock(wrap, supplyStore, 20), stock(wrap, output, 2),
        ]);
        const result = await subject.getBomWithInventory('bom-synthetic', output.id, 3);
        expect(result).toEqual({
            ok: true,
            value: {
                data: [
                    {
                        productVariantId: raw.id, name: raw.name, unit: 'KG',
                        stdQty: 2.5, bomOutput: 2, requiredQty: 3.75,
                        currentStock: 10, totalStock: 11,
                        sourceLocationId: rawStore.id, sourceLocationName: rawStore.name,
                    },
                    {
                        productVariantId: wrap.id, name: wrap.name, unit: 'PCS',
                        stdQty: 4, bomOutput: 2, requiredQty: 6,
                        currentStock: 20, totalStock: 22,
                        sourceLocationId: supplyStore.id, sourceLocationName: supplyStore.name,
                    },
                ],
                meta: {
                    requestedSourceLocationId: output.id,
                    suggestedSourceLocationId: null, suggestedSourceLocationName: null,
                },
            },
        });
        expectPreviewQueries([raw.id, wrap.id]);
    });

    it('suggests one alternative only when the nonempty requested source differs', async () => {
        db.inventory.findMany.mockResolvedValue([
            stock(raw, rawStore, 10), stock(wrap, rawStore, 20),
        ]);
        const result = await subject.getBomWithInventory('bom-synthetic', output.id, 3);
        expect(result).toMatchObject({
            ok: true,
            value: {
                data: [{ sourceLocationId: rawStore.id }, { sourceLocationId: rawStore.id }],
                meta: {
                    requestedSourceLocationId: output.id,
                    suggestedSourceLocationId: rawStore.id,
                    suggestedSourceLocationName: rawStore.name,
                },
            },
        });
    });

    it.each([output.id, ''])('does not suggest a source when it matches or no source was requested (%j)', async (requested) => {
        db.inventory.findMany.mockResolvedValue([
            stock(raw, output, 10), stock(wrap, output, 20),
        ]);
        expect(await subject.getBomWithInventory('bom-synthetic', requested, 3)).toMatchObject({
            ok: true,
            value: {
                data: [{ sourceLocationId: output.id }, { sourceLocationId: output.id }],
                meta: {
                    requestedSourceLocationId: requested,
                    suggestedSourceLocationId: null, suggestedSourceLocationName: null,
                },
            },
        });
    });

    it('keeps zero-stock materials at their type default sources', async () => {
        expect(await subject.getBomWithInventory('bom-synthetic', output.id, 3)).toMatchObject({
            ok: true,
            value: {
                data: [
                    { currentStock: 0, totalStock: 0, sourceLocationId: rawStore.id, sourceLocationName: rawStore.name },
                    { currentStock: 0, totalStock: 0, sourceLocationId: supplyStore.id, sourceLocationName: supplyStore.name },
                ],
                meta: { suggestedSourceLocationId: null, suggestedSourceLocationName: null },
            },
        });
    });

    it('keeps empty source ids and names when no warehouse or requested source exists', async () => {
        db.location.findMany.mockResolvedValue([]);
        expect(await subject.getBomWithInventory('bom-synthetic', '', 3)).toMatchObject({
            ok: true,
            value: {
                data: [
                    { currentStock: 0, totalStock: 0, sourceLocationId: '', sourceLocationName: '' },
                    { currentStock: 0, totalStock: 0, sourceLocationId: '', sourceLocationName: '' },
                ],
                meta: {
                    requestedSourceLocationId: '',
                    suggestedSourceLocationId: null, suggestedSourceLocationName: null,
                },
            },
        });
    });

    it('returns an empty preview without resolving warehouses when the BOM has no items', async () => {
        db.bom.findUnique.mockResolvedValue(recipe([]));
        expect(await subject.getBomWithInventory('bom-synthetic', output.id, 3)).toEqual({
            ok: true,
            value: {
                data: [],
                meta: {
                    requestedSourceLocationId: output.id,
                    suggestedSourceLocationId: null, suggestedSourceLocationName: null,
                },
            },
        });
        expect(db.location.findMany).not.toHaveBeenCalled();
        expect(db.inventory.findMany).not.toHaveBeenCalled();
    });

    it.each(['bom', 'location', 'inventory'] as const)('propagates the original %s DB failure instead of returning Err', async (step) => {
        const failure = new Error(`synthetic ${step} failure`);
        if (step === 'bom') db.bom.findUnique.mockRejectedValue(failure);
        if (step === 'location') db.location.findMany.mockRejectedValue(failure);
        if (step === 'inventory') db.inventory.findMany.mockRejectedValue(failure);
        await expect(subject.getBomWithInventory('bom-synthetic', output.id, 3)).rejects.toBe(failure);
        if (step === 'bom') expect(db.location.findMany).not.toHaveBeenCalled();
        if (step !== 'inventory') expect(db.inventory.findMany).not.toHaveBeenCalled();
    });
});
