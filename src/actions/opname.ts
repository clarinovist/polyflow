'use server';

import { prisma } from '@/lib/prisma';
import { OpnameStatus, MovementType } from '@prisma/client';
import { revalidatePath } from 'next/cache';

export async function getOpnameSessions() {
    return await prisma.stockOpname.findMany({
        orderBy: {
            createdAt: 'desc',
        },
        include: {
            location: true,
            createdBy: true,
        },
    });
}

export async function getOpnameSession(id: string) {
    return await prisma.stockOpname.findUnique({
        where: { id },
        include: {
            location: true,
            createdBy: true,
            items: {
                include: {
                    productVariant: {
                        include: {
                            product: true
                        }
                    }
                },
                orderBy: {
                    productVariant: {
                        name: 'asc'
                    }
                }
            }
        }
    });
}

export async function createOpnameSession(locationId: string, remarks?: string) {
    try {
        // 1. Get all inventories for this location to snapshot
        const inventories = await prisma.inventory.findMany({
            where: {
                locationId: locationId
            }
        });

        // 2. Create Session
        const session = await prisma.stockOpname.create({
            data: {
                locationId,
                remarks,
                status: OpnameStatus.OPEN,
                items: {
                    create: inventories.map(inv => ({
                        productVariantId: inv.productVariantId,
                        systemQuantity: inv.quantity,
                        countedQuantity: null // Start as null to indicate not counted yet
                    }))
                }
            }
        });

        revalidatePath('/dashboard/inventory/opname');
        return { success: true, id: session.id };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "An unknown error occurred" };
    }
}

export async function saveOpnameCount(
    opnameId: string,
    items: { id: string; countedQuantity: number; notes?: string }[]
) {
    try {
        await prisma.$transaction(
            items.map(item =>
                prisma.stockOpnameItem.update({
                    where: { id: item.id },
                    data: {
                        countedQuantity: item.countedQuantity,
                        notes: item.notes
                    }
                })
            )
        );

        revalidatePath(`/dashboard/inventory/opname/${opnameId}`);
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "An unknown error occurred" };
    }
}

import { logActivity } from '@/lib/audit';

export async function completeOpname(opnameId: string, userId: string) {
    try {
        const opname = await prisma.stockOpname.findUnique({
            where: { id: opnameId },
            include: { items: true }
        });

        if (!opname) throw new Error("Session not found");
        if (opname.status !== 'OPEN') throw new Error("Session is not open");

        await prisma.$transaction(async (tx) => {
            // 1. Process items with variance
            for (const item of opname.items) {
                // If countedQuantity is null, we assume it matched system (or wasn't checked)
                if (item.countedQuantity === null) continue;

                const variance = item.countedQuantity.sub(item.systemQuantity).toNumber();

                if (variance !== 0) {
                    // 2. Update Inventory
                    await tx.inventory.update({
                        where: {
                            locationId_productVariantId: {
                                locationId: opname.locationId,
                                productVariantId: item.productVariantId
                            }
                        },
                        data: {
                            quantity: item.countedQuantity
                        }
                    });

                    // 3. Create Movement
                    await tx.stockMovement.create({
                        data: {
                            type: MovementType.ADJUSTMENT,
                            productVariantId: item.productVariantId,
                            fromLocationId: variance < 0 ? opname.locationId : null,
                            toLocationId: variance > 0 ? opname.locationId : null,
                            quantity: Math.abs(variance),
                            reference: `Stock Opname #${opname.id.slice(0, 8)}`,
                        }
                    });
                }
            }

            // 4. Close Session
            await tx.stockOpname.update({
                where: { id: opnameId },
                data: {
                    status: OpnameStatus.COMPLETED,
                    completedAt: new Date()
                }
            });

            // 5. Log Activity
            await logActivity({
                userId,
                action: 'COMPLETE_OPNAME',
                entityType: 'StockOpname',
                entityId: opnameId,
                details: `Completed opname for location ${opname.locationId}`,
                tx,
            });
        });

        revalidatePath(`/dashboard/inventory/opname/${opnameId}`);
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "An unknown error occurred" };
    }
}
