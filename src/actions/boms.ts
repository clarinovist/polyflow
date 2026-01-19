'use server';

import { prisma } from '@/lib/prisma';
import { createBomSchema, CreateBomValues } from '@/lib/schemas/production';
import { revalidatePath } from 'next/cache';

export async function getBoms() {
    try {
        const boms = await prisma.bom.findMany({
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
        return { success: true, data: JSON.parse(JSON.stringify(boms)) };
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
        return { success: true, data: JSON.parse(JSON.stringify(variants)) };
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
                productVariantId: validated.productVariantId,
                outputQuantity: validated.outputQuantity,
                isDefault: validated.isDefault,
                items: {
                    create: validated.items.map(item => ({
                        productVariantId: item.productVariantId,
                        quantity: item.quantity,
                        scrapPercentage: 0
                    }))
                }
            }
        });

        revalidatePath('/dashboard/production/boms');
        return { success: true, data: bom };
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

        return { success: true, data: bom };
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
                    productVariantId: validated.productVariantId,
                    outputQuantity: validated.outputQuantity,
                    isDefault: validated.isDefault,
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
                    scrapPercentage: 0
                }))
            });

            return updatedBom;
        });

        revalidatePath('/dashboard/production/boms');
        return { success: true, data: result };
    } catch (error) {
        console.error("Error updating BOM:", error);
        return { success: false, error: "Failed to update BOM" };
    }
}


