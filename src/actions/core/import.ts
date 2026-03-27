'use server';

import { withTenant } from "@/lib/core/tenant";
import { prisma } from '@/lib/core/prisma';
import { revalidatePath } from 'next/cache';
import { ProductType, Unit, Prisma } from '@prisma/client';
import { getNextSKU } from '../product';
import { logger } from '@/lib/config/logger';
import { safeAction, BusinessRuleError } from '@/lib/errors/errors';

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

export const getExistingSKUs = withTenant(
async function getExistingSKUs() {
    return safeAction(async () => {
        const variants = await prisma.productVariant.findMany({
            select: {
                skuCode: true
            }
        });

        return Array.from(new Set(variants.map(v => v.skuCode)));
    });
}
);

export const importProducts = withTenant(
async function importProducts(products: ImportProduct[]) {
    return safeAction(async () => {
        try {
            let productCount = 0;
            let variantCount = 0;

            const supplierNames = new Set<string>();
            products.forEach(p => {
                p.variants.forEach(v => {
                    if (v.supplierName?.trim()) {
                        supplierNames.add(v.supplierName.trim());
                    }
                });
            });

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
                const sessionGeneratedSkus = new Set<string>();

                for (const productData of products) {
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
                            const skuResult = await getNextSKU(productData.productType, productData.productName);
                            if (!skuResult.success || !skuResult.data) {
                                throw new Error(skuResult.error || "Failed to generate SKU");
                            }
                            finalSku = skuResult.data;

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
                imported: productCount + variantCount,
                products: productCount,
                variants: variantCount
            };
        } catch (error) {
            logger.error('Failed to import products', { error, module: 'ImportActions' });
            throw new BusinessRuleError(error instanceof Error ? error.message : 'An unknown error occurred');
        }
    });
}
);
