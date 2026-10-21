import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { validatePackagedOutput, postPackagedOutput } from '../packaging-output-service';
import { consumeActualPackaging } from '../packaging-consumption-service';
import { InventoryCoreService } from '@/services/inventory/core-service';
import { ProductionCostService } from '../cost-service';
import type { ProductionExecutionOrder } from '../execution-types';
vi.mock('../cost-service', () => ({ ProductionCostService: { calculateBatchTotalCost: vi.fn() } }));
vi.mock('../packaging-consumption-service', () => ({ consumeActualPackaging: vi.fn() }));
vi.mock('@/services/inventory/core-service', () => ({ InventoryCoreService: { incrementStockWithCost: vi.fn() } }));
vi.mock('@/services/accounting/accounting-service', () => ({ AccountingService: { recordInventoryMovement: vi.fn() } }));
const d = (n: number) => new Prisma.Decimal(n);
const base = { id: 'base', productId: 'product', primaryUnit: 'KG', salesUnit: null, conversionFactor: d(1) };
const group = { productVariantId: 'a', quantity: 10, packaging: [{ productVariantId: 'label-a', sourceLocationId: 'stock', ownerCustomerId: null, quantity: 100 }] };
const data = { clientRequestId: 'ce26b37c-85c5-46cb-bc5c-5ec212db2da4', groups: [group] };
const order = { id: 'order', locationId: 'fg', plannedQuantity: 20, plannedMaterials: [], bom: { productVariantId: 'base', items: [] } } as unknown as ProductionExecutionOrder;
const db = {
    location: { findUniqueOrThrow: vi.fn() },
    productVariant: { findUniqueOrThrow: vi.fn(), findMany: vi.fn() }, productionPackagingOption: { findMany: vi.fn() },
    productionOrder: { findUniqueOrThrow: vi.fn() }, maklonCostItem: { findMany: vi.fn() },
    stockMovement: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    productionOutputGroup: { create: vi.fn(), findMany: vi.fn() }, productionPackagingConsumption: { create: vi.fn() },
};
const tx = db as unknown as Prisma.TransactionClient;
describe('packaged output mapping and per-posting cost', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        db.location.findUniqueOrThrow.mockResolvedValue({ id: 'fg', locationType: 'INTERNAL', packagingOwnerCustomerId: null });
        db.productVariant.findUniqueOrThrow.mockResolvedValue(base);
        db.productVariant.findMany.mockResolvedValue([]);
        db.productionPackagingOption.findMany.mockResolvedValue([{ outputVariantId: 'a', labelVariantId: 'label-a', outputVariant: { ...base, id: 'a' } }]);
        db.stockMovement.findFirst.mockResolvedValue(null);
        db.stockMovement.findMany.mockResolvedValue([{ quantity: d(10), cost: d(5) }]);
        db.productionOrder.findUniqueOrThrow.mockResolvedValue({ estimatedConversionCost: d(40), isMaklon: false, maklonCustomerId: null, customerDestinations: [], salesOrder: null });
        db.stockMovement.create.mockImplementation(async ({ data: movement }) => ({ id: 'out', ...movement }));
        db.productionOutputGroup.create.mockResolvedValue({ id: 'group' });
        db.productionOutputGroup.findMany.mockResolvedValue([]);
        vi.mocked(ProductionCostService.calculateBatchTotalCost).mockResolvedValue(d(100));
        vi.mocked(consumeActualPackaging).mockResolvedValue([{ movement: { id: 'consume', productVariantId: 'label-a', quantity: d(100) }, cost: d(30) }] as never);
    });
    it('accepts explicit matching brand mapping without duplicating BOM', async () => {
        expect((await validatePackagedOutput(tx, order, data, 10)).ids).toEqual(['label-a']);
    });
    it('rejects unmapped output, wrong label, inconsistent totals and conflicting legacy issue', async () => {
        await expect(validatePackagedOutput(tx, order, { ...data, groups: [{ ...group, productVariantId: 'b' }] }, 10)).rejects.toThrow('dipetakan');
        await expect(validatePackagedOutput(tx, order, { ...data, groups: [{ ...group, packaging: [{ ...group.packaging[0], productVariantId: 'wrong' }] }] }, 10)).rejects.toThrow('Etiket');
        await expect(validatePackagedOutput(tx, order, data, 20)).rejects.toThrow('Jumlah');
        db.stockMovement.findFirst.mockResolvedValue({ id: 'legacy' });
        await expect(validatePackagedOutput(tx, order, data, 10)).rejects.toThrow('jalur lama');
    });
    it('rejects omitted effective-plan packaging instead of silently backflushing it', async () => {
        db.productVariant.findMany.mockResolvedValue([{ id: 'sack' }]);
        await expect(validatePackagedOutput(tx, order, data, 10)).rejects.toThrow('seluruh kemasan');
    });
    it('capitalizes only remaining cost on successive partial results', async () => {
        vi.mocked(ProductionCostService.calculateBatchTotalCost).mockResolvedValue(d(400));
        db.productionOutputGroup.findMany.mockResolvedValue([{ quantity: d(10), unitCost: d(10) }]);
        await postPackagedOutput(tx, order, 'exec-2', data, 'actor');
        expect(InventoryCoreService.incrementStockWithCost).toHaveBeenCalledWith(tx, 'fg', 'a', 10, 30);
    });
    it('posts branded SKU at actual remaining order cost', async () => {
        await postPackagedOutput(tx, order, 'exec', data, 'actor');
        // Remaining order cost 100 (including packaging) / 10 KG.
        expect(InventoryCoreService.incrementStockWithCost).toHaveBeenCalledWith(tx, 'fg', 'a', 10, 10);
        expect(db.stockMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ productVariantId: 'a', productionExecutionId: 'exec' }) });
        expect(db.productionPackagingConsumption.create).toHaveBeenCalledWith({ data: expect.objectContaining({ executionId: 'exec', outputGroupId: 'group', movementId: 'consume' }) });
    });
});
