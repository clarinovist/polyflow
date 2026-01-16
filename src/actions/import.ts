'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { ProductType, Unit, Prisma } from '@prisma/client';
import { getNextSKU } from './product';

export interface ImportVariant {
    name: string;
    skuCode: string;
    primaryUnit: Unit;
    salesUnit?: Unit;
    conversionFactor?: number;
    price?: number;
    minStockAlert?: number;
    supplierName?: string;
    attributes?: Record<string, unknown>;
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

        // 1. Collect all unique supplier names
        const supplierNames = new Set<string>();
        products.forEach(p => {
            p.variants.forEach(v => {
                if (v.supplierName?.trim()) {
                    supplierNames.add(v.supplierName.trim());
                }
            });
        });

        // 2. Fetch existing suppliers to map Name -> ID
        const supplierMap = new Map<string, string>();
        if (supplierNames.size > 0) {
            const suppliers = await prisma.supplier.findMany({
                where: {
                    name: { in: Array.from(supplierNames) }
                },
                select: { id: true, name: true }
            });

            suppliers.forEach(s => supplierMap.set(s.name, s.id));
        }

        await prisma.$transaction(async (tx) => {
            // Track ALL generated SKUs in this import session to avoid race condition/duplicates
            const sessionGeneratedSkus = new Set<string>();

            for (const productData of products) {
                // Create product
                const product = await tx.product.create({
                    data: {
                        name: productData.productName,
                        productType: productData.productType
                    }
                });

                productCount++;

                for (const v of productData.variants) {
                    const supplierId = v.supplierName && supplierMap.get(v.supplierName.trim());

                    let finalSku = v.skuCode?.trim().toUpperCase();
                    if (!finalSku) {
                        finalSku = await getNextSKU(productData.productType, productData.productName);

                        // If we generated one that we already generated in this import session, 
                        // we need to increment until it's unique
                        const baseSku = finalSku.substring(0, 5);
                        while (sessionGeneratedSkus.has(finalSku)) {
                            const lastSeqStr = finalSku.substring(5);
                            const lastSeq = parseInt(lastSeqStr, 10);
                            finalSku = `${baseSku}${(lastSeq + 1).toString().padStart(3, '0')}`;
                        }
                    }
                    sessionGeneratedSkus.add(finalSku);

                    const variant = await tx.productVariant.create({
                        data: {
                            productId: product.id,
                            name: v.name,
                            skuCode: finalSku,
                            primaryUnit: v.primaryUnit,
                            salesUnit: v.salesUnit || v.primaryUnit,
                            conversionFactor: new Prisma.Decimal(v.conversionFactor || 1),
                            price: v.price ? new Prisma.Decimal(v.price) : null,
                            buyPrice: v.price ? new Prisma.Decimal(v.price) : null,
                            minStockAlert: v.minStockAlert ? new Prisma.Decimal(v.minStockAlert) : null,
                            preferredSupplierId: supplierId || null,
                            attributes: v.attributes ? v.attributes as Prisma.InputJsonValue : Prisma.JsonNull
                        }
                    });

                    // Create supplier-product link if supplier exists
                    if (supplierId) {
                        await tx.supplierProduct.create({
                            data: {
                                supplierId: supplierId,
                                productVariantId: variant.id,
                                isPreferred: true,
                                unitPrice: v.price ? new Prisma.Decimal(v.price) : null,
                            }
                        });
                    }

                    variantCount++;
                }
            }
        });

        revalidatePath('/dashboard/products');

        return {
            success: true,
            imported: productCount + variantCount,
            products: productCount,
            variants: variantCount
        };
    } catch (error) {
        console.error('Import error:', error);
        return {
            success: false,
            imported: 0,
            products: 0,
            variants: 0,
            errors: [error instanceof Error ? error.message : 'An unknown error occurred']
        };
    }
}
