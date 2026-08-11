import { beforeEach, describe, expect, it, vi } from 'vitest';

import { recordExecutionScrap } from '../execution-scrap-recording';
import { ProductionMaterialService } from '../material-service';

vi.mock('../material-service', () => ({
    ProductionMaterialService: {
        recordScrap: vi.fn(),
    },
}));

const createTx = () => ({
    location: {
        findUnique: vi.fn().mockResolvedValue({ id: 'loc-scrap' }),
    },
    productVariant: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
    },
    scrapRecord: {
        updateMany: vi.fn(),
    },
});

describe('recordExecutionScrap', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('uses tenant affal SKUs for prongkol and daun scrap', async () => {
        const tx = createTx();
        tx.productVariant.findUnique.mockImplementation(({ where }: any) => {
            if (where.skuCode === 'AP000000') {
                return Promise.resolve({ id: 'variant-prongkol' });
            }
            if (where.skuCode === 'AD000000') {
                return Promise.resolve({ id: 'variant-daun' });
            }
            return Promise.resolve(null);
        });

        await recordExecutionScrap({
            tx: tx as any,
            productionOrderId: 'po-1',
            executionId: 'exec-1',
            scrapQuantity: 0,
            scrapProngkolQty: 4.4,
            scrapDaunQty: 4.6,
            userId: 'user-1',
        });

        expect(ProductionMaterialService.recordScrap).toHaveBeenCalledTimes(2);
        expect(ProductionMaterialService.recordScrap).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                productionOrderId: 'po-1',
                productVariantId: 'variant-prongkol',
                locationId: 'loc-scrap',
                quantity: 4.4,
                reason: 'Production Process Waste (Lumps)',
                userId: 'user-1',
            }),
            tx,
        );
        expect(ProductionMaterialService.recordScrap).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                productionOrderId: 'po-1',
                productVariantId: 'variant-daun',
                locationId: 'loc-scrap',
                quantity: 4.6,
                reason: 'Production Process Waste (Trim)',
                userId: 'user-1',
            }),
            tx,
        );
        expect(tx.scrapRecord.updateMany).toHaveBeenCalledWith({
            where: {
                productionOrderId: 'po-1',
                productVariantId: 'variant-prongkol',
                locationId: 'loc-scrap',
                quantity: 4.4,
            },
            data: { productionExecutionId: 'exec-1' },
        });
        expect(tx.scrapRecord.updateMany).toHaveBeenCalledWith({
            where: {
                productionOrderId: 'po-1',
                productVariantId: 'variant-daun',
                locationId: 'loc-scrap',
                quantity: 4.6,
            },
            data: { productionExecutionId: 'exec-1' },
        });
    });

    it('falls back to legacy scrap SKUs when tenant affal SKUs are absent', async () => {
        const tx = createTx();
        tx.productVariant.findUnique.mockImplementation(({ where }: any) => {
            if (where.skuCode === 'SCRAP-PRONGKOL') {
                return Promise.resolve({ id: 'legacy-prongkol' });
            }
            if (where.skuCode === 'SCRAP-DAUN') {
                return Promise.resolve({ id: 'legacy-daun' });
            }
            return Promise.resolve(null);
        });

        await recordExecutionScrap({
            tx: tx as any,
            productionOrderId: 'po-1',
            executionId: 'exec-1',
            scrapQuantity: 0,
            scrapProngkolQty: 1,
            scrapDaunQty: 2,
        });

        expect(tx.productVariant.findUnique).toHaveBeenCalledWith({
            where: { skuCode: 'AP000000' },
        });
        expect(tx.productVariant.findUnique).toHaveBeenCalledWith({
            where: { skuCode: 'SCRAP-PRONGKOL' },
        });
        expect(ProductionMaterialService.recordScrap).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ productVariantId: 'legacy-prongkol' }),
            tx,
        );
        expect(ProductionMaterialService.recordScrap).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ productVariantId: 'legacy-daun' }),
            tx,
        );
    });

    it('falls back to SCRAP product name matching when known SKUs are absent', async () => {
        const tx = createTx();
        tx.productVariant.findUnique.mockResolvedValue(null);
        tx.productVariant.findFirst.mockImplementation(({ where }: any) => {
            const nameContains = where.name.contains;
            if (nameContains === 'Prongkol') {
                return Promise.resolve({ id: 'name-prongkol' });
            }
            if (nameContains === 'Daun') {
                return Promise.resolve({ id: 'name-daun' });
            }
            return Promise.resolve(null);
        });

        await recordExecutionScrap({
            tx: tx as any,
            productionOrderId: 'po-1',
            executionId: 'exec-1',
            scrapQuantity: 0,
            scrapProngkolQty: 1,
            scrapDaunQty: 2,
        });

        expect(tx.productVariant.findFirst).toHaveBeenCalledWith({
            where: {
                name: { contains: 'Prongkol', mode: 'insensitive' },
                product: { productType: 'SCRAP' },
            },
            orderBy: { skuCode: 'asc' },
        });
        expect(tx.productVariant.findFirst).toHaveBeenCalledWith({
            where: {
                name: { contains: 'Daun', mode: 'insensitive' },
                product: { productType: 'SCRAP' },
            },
            orderBy: { skuCode: 'asc' },
        });
        expect(ProductionMaterialService.recordScrap).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ productVariantId: 'name-prongkol' }),
            tx,
        );
        expect(ProductionMaterialService.recordScrap).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ productVariantId: 'name-daun' }),
            tx,
        );
    });
});
