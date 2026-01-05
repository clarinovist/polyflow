'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { ProductType, Unit, Prisma } from '@prisma/client';

export interface ImportVariant {
    name: string;
    skuCode: string;
    primaryUnit: Unit;
    salesUnit?: Unit;
    conversionFactor: number;
    price?: number;
    buyPrice?: number;
    sellPrice?: number;
    minStockAlert?: number;
    attributes?: Record<string, any>;
}

export interface ImportProduct {
    productName: string;
    productType: ProductType;
    variants: ImportVariant[];
}

export interface ImportResult {
    success: boolean;
    imported: number;
    products: number;
    variants: number;
    errors?: string[];
}

/**
 * Get all existing SKU codes from database
 */
export async function getExistingSKUs(): Promise<Set<string>> {
    const variants = await prisma.productVariant.findMany({
        select: {
            skuCode: true
        }
    });

    return new Set(variants.map(v => v.skuCode));
}

/**
 * Import products in batch
 */
export async function importProducts(products: ImportProduct[]): Promise<ImportResult> {
    try {
        let productCount = 0;
        let variantCount = 0;

        await prisma.$transaction(async (tx) => {
            for (const productData of products) {
                // Create product
                const product = await tx.product.create({
                    data: {
                        name: productData.productName,
                        productType: productData.productType
                    }
                });

                productCount++;

                // Create variants
                const variantData = productData.variants.map(v => ({
                    productId: product.id,
                    name: v.name,
                    skuCode: v.skuCode.toUpperCase(),
                    primaryUnit: v.primaryUnit,
                    salesUnit: v.salesUnit || v.primaryUnit,
                    conversionFactor: new Prisma.Decimal(v.conversionFactor),
                    price: v.price ? new Prisma.Decimal(v.price) : null,
                    buyPrice: v.buyPrice ? new Prisma.Decimal(v.buyPrice) : null,
                    sellPrice: v.sellPrice ? new Prisma.Decimal(v.sellPrice) : null,
                    minStockAlert: v.minStockAlert ? new Prisma.Decimal(v.minStockAlert) : null,
                    attributes: v.attributes ? v.attributes as Prisma.InputJsonValue : Prisma.JsonNull
                }));

                await tx.productVariant.createMany({
                    data: variantData
                });

                variantCount += variantData.length;
            }
        });

        revalidatePath('/dashboard/products');

        return {
            success: true,
            imported: productCount + variantCount,
            products: productCount,
            variants: variantCount
        };
    } catch (error: any) {
        console.error('Import error:', error);
        return {
            success: false,
            imported: 0,
            products: 0,
            variants: 0,
            errors: [error.message || 'Failed to import products']
        };
    }
}
