'use server';

import { prisma } from '@/lib/prisma';
import { createBomSchema, CreateBomValues } from '@/lib/schemas/production';
import { revalidatePath } from 'next/cache';
import { serializeData } from '@/lib/utils';
import { calculateBomCost } from '@/lib/production-utils';

export async function getBoms(category?: string) {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const where: any = {};
        if (category && category !== 'ALL') {
            where.category = category;
        }

        const boms = await prisma.bom.findMany({
            where,
            include: {
                productVariant: {
                    include: {
                        product: true
                    }
                },
                items: {
                    include: {
                        productVariant: {
                            include: {
                                product: true
                            }
                        }
                    }
                }
            },
            orderBy: {
                updatedAt: 'desc'
            }
        });
        return { success: true, data: serializeData(boms) };
    } catch (error) {
        console.error("Error fetching BOMs:", error);
        return { success: false, error: "Failed to fetch BOMs" };
    }
}

export async function getProductVariants() {
    try {
        const variants = await prisma.productVariant.findMany({
            include: {
                product: true
            },
            orderBy: {
                name: 'asc'
            }
        });
        return { success: true, data: serializeData(variants) };
    } catch (error) {
        console.error("Error fetching variants:", error);
        return { success: false, error: "Failed to fetch variants" };
    }
}

export async function createBom(data: CreateBomValues) {
    try {
        const validated = createBomSchema.parse(data);

        const bom = await prisma.bom.create({
            data: {
                name: validated.name,
                productVariant: { connect: { id: validated.productVariantId } },
                outputQuantity: validated.outputQuantity,
                isDefault: validated.isDefault,
                category: validated.category,
                items: {
                    create: validated.items.map(item => ({
                        productVariantId: item.productVariantId,
                        quantity: item.quantity,
                        scrapPercentage: item.scrapPercentage
                    }))
                }
            }
        });

        // Perform Cost Roll-up
        const createdBom = await prisma.bom.findUnique({
            where: { id: bom.id },
            include: { items: { include: { productVariant: true } } }
        });

        if (createdBom) {
            const totalCost = calculateBomCost(createdBom.items);
            const unitCost = totalCost / Number(createdBom.outputQuantity || 1);

            await prisma.productVariant.update({
                where: { id: validated.productVariantId },
                data: { standardCost: unitCost }
            });
        }

        revalidatePath('/dashboard/boms');
        return { success: true, data: serializeData(bom) };
    } catch (error) {
        console.error("Error creating BOM:", error);
        return { success: false, error: "Failed to create BOM" };
    }
}

export async function getBom(id: string) {
    try {
        const bom = await prisma.bom.findUnique({
            where: { id },
            include: {
                productVariant: {
                    include: {
                        product: true
                    }
                },
                items: {
                    include: {
                        productVariant: {
                            include: {
                                product: true
                            }
                        }
                    }
                }
            }
        });

        if (!bom) {
            return { success: false, error: "Recipe not found" };
        }

        return { success: true, data: serializeData(bom) };
    } catch (error) {
        console.error("Error fetching BOM:", error);
        return { success: false, error: "Failed to fetch BOM" };
    }
}

export async function updateBom(id: string, data: CreateBomValues) {
    try {
        const validated = createBomSchema.parse(data);

        // Transactional update: Delete existing items and recreate them
        const result = await prisma.$transaction(async (tx) => {
            // Update BOM Header
            const updatedBom = await tx.bom.update({
                where: { id },
                data: {
                    name: validated.name,
                    productVariant: { connect: { id: validated.productVariantId } },
                    outputQuantity: validated.outputQuantity,
                    isDefault: validated.isDefault,
                    category: validated.category,
                }
            });

            // Delete existing items
            await tx.bomItem.deleteMany({
                where: { bomId: id }
            });

            // Create new items
            await tx.bomItem.createMany({
                data: validated.items.map(item => ({
                    bomId: id,
                    productVariantId: item.productVariantId,
                    quantity: item.quantity,
                    scrapPercentage: item.scrapPercentage
                }))
            });

            // Re-fetch items to calculate cost (since we just inserted them)
            const newItemsWithCosts = await tx.bomItem.findMany({
                where: { bomId: id },
                include: { productVariant: true }
            });

            const totalCost = calculateBomCost(newItemsWithCosts);
            const unitCost = totalCost / Number(updatedBom.outputQuantity || 1);

            await tx.productVariant.update({
                where: { id: validated.productVariantId },
                data: { standardCost: unitCost }
            });

            return updatedBom;
        });

        revalidatePath('/dashboard/boms');
        return { success: true, data: serializeData(result) };
    } catch (error) {
        console.error("Error updating BOM:", error);
        return { success: false, error: "Failed to update BOM" };
    }
}

export async function deleteBom(id: string) {
    try {
        await prisma.bom.delete({
            where: { id }
        });
        revalidatePath('/dashboard/boms');
        return { success: true };
    } catch (error) {
        console.error("Error deleting BOM:", error);
        return { success: false, error: "Failed to delete BOM. It might be in use by a production order." };
    }
}


