import { Prisma, GoodsReceipt, MovementType } from '@prisma/client';
import { prisma } from '@/lib/core/prisma';
import { InventoryCoreService } from '@/services/inventory/core-service';

export class MaklonReceiptService {
    static async createReceipt(data: {
        receiptNumber: string;
        customerId: string;
        locationId: string;
        notes?: string;
        createdById?: string;
        items: {
            productVariantId: string;
            receivedQty: number;
        }[];
    }, tx?: Prisma.TransactionClient): Promise<GoodsReceipt> {
        const execute = async (t: Prisma.TransactionClient) => {
            // 1. Create Receipt Record
            const receipt = await t.goodsReceipt.create({
                data: {
                    receiptNumber: data.receiptNumber,
                    customerId: data.customerId,
                    locationId: data.locationId,
                    isMaklon: true,
                    notes: data.notes,
                    createdById: data.createdById,
                    items: {
                        create: data.items.map((item) => ({
                            productVariantId: item.productVariantId,
                            receivedQty: item.receivedQty,
                            unitCost: 0 // Maklon receipts have 0 unit cost
                        }))
                    }
                },
                include: { items: true }
            });

            // 2. Adjust Inventory & Create Movements
            for (const item of data.items) {
                // Maklon materials enter inventory with 0 cost
                await InventoryCoreService.incrementStockWithCost(
                    t,
                    data.locationId,
                    item.productVariantId,
                    item.receivedQty,
                    0
                );

                await t.stockMovement.create({
                    data: {
                        type: MovementType.IN,
                        productVariantId: item.productVariantId,
                        toLocationId: data.locationId,
                        quantity: item.receivedQty,
                        cost: 0,
                        reference: `MGR-${receipt.receiptNumber}${receipt.notes ? ` - ${receipt.notes}` : ''}`,
                        goodsReceiptId: receipt.id,
                        createdById: data.createdById
                    }
                });
            }

            return receipt;
        };

        if (tx) return execute(tx);
        return await prisma.$transaction(execute);
    }
}
