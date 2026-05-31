import { prisma } from '@/lib/core/prisma';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import { logActivity } from '@/lib/tools/audit';
import { AccountingService } from '@/services/accounting/accounting-service';
import { MovementType, OpnameStatus } from '@prisma/client';

export class StockOpnameService {
    static async completeOpname(opnameId: string, userId: string): Promise<void> {
        const opname = await prisma.stockOpname.findUnique({
            where: { id: opnameId },
            include: { items: true }
        });

        if (!opname) throw new NotFoundError('StockOpname', opnameId);
        if (opname.status !== OpnameStatus.OPEN) throw new BusinessRuleError('Session is not open');

        await prisma.$transaction(async (tx) => {
            // 1. Process items with variance
            for (const item of opname.items) {
                // If countedQuantity is null, we assume it matched system (or wasn't checked)
                if (item.countedQuantity === null) continue;

                const variance = item.countedQuantity.sub(item.systemQuantity).toNumber();

                if (variance !== 0) {
                    // 2. Upsert Inventory (create if doesn't exist — handles items added manually via addItemToOpname)
                    await tx.inventory.upsert({
                        where: {
                            locationId_productVariantId: {
                                locationId: opname.locationId,
                                productVariantId: item.productVariantId
                            }
                        },
                        update: {
                            quantity: item.countedQuantity
                        },
                        create: {
                            locationId: opname.locationId,
                            productVariantId: item.productVariantId,
                            quantity: item.countedQuantity
                        }
                    });

                    // 3. Create Movement
                    const movement = await tx.stockMovement.create({
                        data: {
                            type: MovementType.ADJUSTMENT,
                            productVariantId: item.productVariantId,
                            fromLocationId: variance < 0 ? opname.locationId : null,
                            toLocationId: variance > 0 ? opname.locationId : null,
                            quantity: Math.abs(variance),
                            reference: opname.opnameNumber || `Stock Opname #${opname.id.slice(0, 8)}`,
                        }
                    });

                    // 4. Record Journal Entry
                    await AccountingService.recordInventoryMovement(movement, tx);
                }
            }

            // 5. Close Session
            await tx.stockOpname.update({
                where: { id: opnameId },
                data: {
                    status: OpnameStatus.COMPLETED,
                    completedAt: new Date()
                }
            });

            // 6. Log Activity
            await logActivity({
                userId,
                action: 'COMPLETE_OPNAME',
                entityType: 'StockOpname',
                entityId: opnameId,
                details: `Completed opname for location ${opname.locationId}`,
                tx,
            });
        });
    }
}
