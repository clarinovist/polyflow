"use server";

import { withTenant } from "@/lib/core/tenant";
import { prisma } from "@/lib/core/prisma";
import {
  createProductSchema,
  updateProductSchema,
  CreateProductValues,
  UpdateProductValues,
} from "@/lib/schemas/product";
import { Prisma, Unit } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/tools/auth-checks";
import { logger } from "@/lib/config/logger";
import { logActivity } from "@/lib/tools/audit";
import { safeAction, BusinessRuleError } from "@/lib/errors/errors";

export const createProduct = withTenant(async function createProduct(
  data: CreateProductValues,
) {
  return safeAction(async () => {
    const session = await requireAuth();
    const result = createProductSchema.safeParse(data);

    if (!result.success) {
      throw new BusinessRuleError(result.error.issues[0].message);
    }

    const { name, productType, variants, assetCategory, usefulLifeMonths, inventoryAccountId } = result.data as typeof result.data & { assetCategory?: unknown; usefulLifeMonths?: number | null; inventoryAccountId?: string | null };

    try {
      const existingSkus = await prisma.productVariant.findMany({
        where: {
          skuCode: {
            in: variants.map((v) => v.skuCode),
          },
        },
        select: {
          skuCode: true,
        },
      });

      if (existingSkus.length > 0) {
        throw new BusinessRuleError(
          `SKU code(s) already exist: ${existingSkus.map((s) => s.skuCode).join(", ")}`,
        );
      }

      const createdProduct = await prisma.$transaction(async (tx) => {
        const product = await tx.product.create({
          data: {
            name,
            productType,
            ...(productType === 'FIXED_ASSET' ? {
              assetCategory: assetCategory as never || null,
              inventoryAccountId: inventoryAccountId || null,
              // ponytail: usefulLifeMonths currently stored via variant attributes / fallback category default.
              // Product model has no attributes Json (only ProductVariant does). Storing here caused Prisma validation Unknown argument `attributes`.
              // For now, save usefulLife into first variant's attributes in createMany below.
            } : {}),
          } as unknown as never,
        });

        await tx.productVariant.createMany({
          data: variants.map((variant, idx) => ({
            productId: product.id,
            name: variant.name,
            skuCode: variant.skuCode,
            primaryUnit: variant.primaryUnit,
            salesUnit: variant.salesUnit || variant.primaryUnit,
            conversionFactor: new Prisma.Decimal(variant.conversionFactor),
            price: variant.price ? new Prisma.Decimal(variant.price) : null,
            buyPrice: variant.buyPrice
              ? new Prisma.Decimal(variant.buyPrice)
              : null,
            minStockAlert: variant.minStockAlert
              ? new Prisma.Decimal(variant.minStockAlert)
              : null,
            // Store custom usefulLife in first variant attributes for FIXED_ASSET (since Product has no Json field)
            ...(productType === 'FIXED_ASSET' && idx === 0 && usefulLifeMonths ? { attributes: { usefulLifeMonths } } : {}),
          })),
        });
        return product;
      });

      await logActivity({
        userId: session.user.id,
        action: "CREATE_PRODUCT",
        entityType: "Product",
        entityId: createdProduct.id,
        details: `Created product ${createdProduct.name}`,
      });

      revalidatePath("/dashboard/products");
      return null;
    } catch (error) {
      if (error instanceof BusinessRuleError) throw error;
      logger.error("Failed to create product", {
        error,
        module: "ProductActions",
      });
      throw new BusinessRuleError(
        "Failed to create product. Please check the inputs.",
      );
    }
  });
});

export const updateProduct = withTenant(async function updateProduct(
  data: UpdateProductValues,
) {
  return safeAction(async () => {
    const session = await requireAuth();
    const result = updateProductSchema.safeParse(data);

    if (!result.success) {
      throw new BusinessRuleError(result.error.issues[0].message);
    }

    const { id, name, productType, variants, assetCategory, usefulLifeMonths, inventoryAccountId } = result.data as typeof result.data & { assetCategory?: unknown; usefulLifeMonths?: number | null; inventoryAccountId?: string | null };

    try {
      const currentProduct = await prisma.product.findUnique({
        where: { id },
        include: { variants: { select: { id: true, skuCode: true } } },
      });

      if (!currentProduct) {
        throw new BusinessRuleError("Produk tidak ditemukan");
      }

      const currentSkuCodes = currentProduct.variants.map((v) => v.skuCode);
      const newSkuCodes = variants
        .map((v) => v.skuCode)
        .filter((sku) => !currentSkuCodes.includes(sku));

      if (newSkuCodes.length > 0) {
        const existingSkus = await prisma.productVariant.findMany({
          where: {
            skuCode: {
              in: newSkuCodes,
            },
          },
          select: {
            skuCode: true,
          },
        });

        if (existingSkus.length > 0) {
          throw new BusinessRuleError(
            `SKU code(s) already exist: ${existingSkus.map((s) => s.skuCode).join(", ")}`,
          );
        }
      }

      await prisma.$transaction(async (tx) => {
        await tx.product.update({
          where: { id },
          data: {
            name,
            productType,
            ...(productType === 'FIXED_ASSET' ? {
              assetCategory: assetCategory as never || null,
              inventoryAccountId: inventoryAccountId || null,
            } : {
              assetCategory: null,
            }),
          } as unknown as never,
        });

        const existingVariantIds = currentProduct.variants.map((v) => v.id);
        const incomingVariantIds = variants
          .filter((v) => v.id)
          .map((v) => v.id!);

        const variantsToDelete = existingVariantIds.filter(
          (id) => !incomingVariantIds.includes(id),
        );

        if (variantsToDelete.length > 0) {
          const variantsWithInventory = await tx.inventory.findMany({
            where: {
              productVariantId: {
                in: variantsToDelete,
              },
              quantity: {
                gt: 0,
              },
            },
            select: {
              productVariant: {
                select: {
                  name: true,
                  skuCode: true,
                },
              },
            },
          });

          if (variantsWithInventory.length > 0) {
            throw new BusinessRuleError(
              `Cannot delete variant(s) with existing inventory: ${variantsWithInventory.map((v) => v.productVariant.skuCode).join(", ")}`,
            );
          }

          await tx.productVariant.deleteMany({
            where: {
              id: {
                in: variantsToDelete,
              },
            },
          });
        }

        for (const variant of variants) {
          const isFirst = variants.indexOf(variant) === 0;
          const variantData = {
            productId: id,
            name: variant.name,
            skuCode: variant.skuCode,
            primaryUnit: variant.primaryUnit,
            salesUnit: variant.salesUnit || variant.primaryUnit,
            conversionFactor: new Prisma.Decimal(variant.conversionFactor),
            price: variant.price ? new Prisma.Decimal(variant.price) : null,
            buyPrice: variant.buyPrice
              ? new Prisma.Decimal(variant.buyPrice)
              : null,
            minStockAlert: variant.minStockAlert
              ? new Prisma.Decimal(variant.minStockAlert)
              : null,
            ...(productType === 'FIXED_ASSET' && isFirst && usefulLifeMonths ? { attributes: { usefulLifeMonths } } : {}),
          } as unknown as never;

          if (variant.id) {
            await tx.productVariant.update({
              where: { id: variant.id },
              data: variantData,
            });
          } else {
            await tx.productVariant.create({
              data: variantData,
            });
          }
        }
      });

      await logActivity({
        userId: session.user.id,
        action: "UPDATE_PRODUCT",
        entityType: "Product",
        entityId: id,
        details: `Updated product ${name}`,
      });

      revalidatePath("/dashboard");
      revalidatePath("/dashboard/products");
      revalidatePath(`/dashboard/products/${id}/edit`);
      return null;
    } catch (error) {
      if (error instanceof BusinessRuleError) throw error;
      logger.error("Failed to update product", {
        error,
        productId: id,
        module: "ProductActions",
      });
      throw new BusinessRuleError(
        "Failed to update product. Please check the inputs.",
      );
    }
  });
});

/**
 * Quick-create a product with a single variant (for mobile sales flow).
 * Product type defaults to FINISHED_GOOD. Returns the created variant object.
 */
export const quickCreateProduct = withTenant(async function quickCreateProduct(
  data: {
    productName: string;
    variantName: string;
    skuCode: string;
    primaryUnit: string;
    sellPrice?: number;
  },
) {
  return safeAction(async () => {
    await requireAuth();

    if (!data.productName.trim()) {
      throw new BusinessRuleError('Nama produk wajib diisi');
    }
    if (!data.skuCode.trim()) {
      throw new BusinessRuleError('SKU wajib diisi');
    }

    const existingSku = await prisma.productVariant.findUnique({
      where: { skuCode: data.skuCode.toUpperCase() },
      select: { id: true },
    });
    if (existingSku) {
      throw new BusinessRuleError(`SKU ${data.skuCode.toUpperCase()} sudah ada`);
    }

    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          name: data.productName.trim(),
          productType: 'FINISHED_GOOD',
        },
      });

      const variant = await tx.productVariant.create({
        data: {
          productId: product.id,
          name: data.variantName.trim() || data.productName.trim(),
          skuCode: data.skuCode.toUpperCase(),
          primaryUnit: data.primaryUnit as Unit,
          salesUnit: data.primaryUnit as Unit,
          conversionFactor: new Prisma.Decimal(1),
          price: data.sellPrice ? new Prisma.Decimal(data.sellPrice) : null,
        },
      });

      return { product, variant };
    });

    revalidatePath('/dashboard/products');
    return {
      id: result.variant.id,
      name: result.variant.name,
      productName: result.product.name,
      skuCode: result.variant.skuCode,
      sellPrice: data.sellPrice || 0,
      displayUnit: data.primaryUnit,
      inventories: [] as { locationId: string; quantity: number }[],
    };
  });
});

export const deleteProduct = withTenant(async function deleteProduct(
  id: string,
) {
  return safeAction(async () => {
    const session = await requireAuth();
    try {
      const variants = await prisma.productVariant.findMany({
        where: { productId: id },
        select: { id: true, skuCode: true },
      });

      const variantIds = variants.map((v) => v.id);

      if (variantIds.length > 0) {
        const checks = await Promise.all([
          prisma.inventory.count({
            where: { productVariantId: { in: variantIds } },
          }),
          prisma.stockMovement.count({
            where: { productVariantId: { in: variantIds } },
          }),
          prisma.batch.count({
            where: { productVariantId: { in: variantIds } },
          }),
          prisma.bomItem.count({
            where: { productVariantId: { in: variantIds } },
          }),
          prisma.materialIssue.count({
            where: { productVariantId: { in: variantIds } },
          }),
          prisma.scrapRecord.count({
            where: { productVariantId: { in: variantIds } },
          }),
          prisma.stockReservation.count({
            where: { productVariantId: { in: variantIds } },
          }),
          prisma.stockOpnameItem.count({
            where: { productVariantId: { in: variantIds } },
          }),
          prisma.productionMaterial.count({
            where: { productVariantId: { in: variantIds } },
          }),
          prisma.bom.count({ where: { productVariantId: { in: variantIds } } }),
        ]);

        const [
          inventoryCount,
          movementCount,
          batchCount,
          bomItemCount,
          materialIssueCount,
          scrapCount,
          reservationCount,
          opnameItemCount,
          productionMaterialCount,
          bomCount,
        ] = checks;

        const referenced: string[] = [];
        if (inventoryCount > 0)
          referenced.push(`Inventory (${inventoryCount})`);
        if (movementCount > 0)
          referenced.push(`StockMovement (${movementCount})`);
        if (batchCount > 0) referenced.push(`Batch (${batchCount})`);
        if (bomItemCount > 0) referenced.push(`BomItem (${bomItemCount})`);
        if (bomCount > 0) referenced.push(`Bom (${bomCount})`);
        if (materialIssueCount > 0)
          referenced.push(`MaterialIssue (${materialIssueCount})`);
        if (scrapCount > 0) referenced.push(`ScrapRecord (${scrapCount})`);
        if (reservationCount > 0)
          referenced.push(`StockReservation (${reservationCount})`);
        if (opnameItemCount > 0)
          referenced.push(`StockOpnameItem (${opnameItemCount})`);
        if (productionMaterialCount > 0)
          referenced.push(`ProductionMaterial (${productionMaterialCount})`);

        if (referenced.length > 0) {
          throw new BusinessRuleError(
            `Cannot delete product. Its variants are referenced in: ${referenced.join(", ")}`,
          );
        }
      }

      await prisma.$transaction(async (tx) => {
        if (variantIds.length > 0) {
          await tx.productVariant.deleteMany({
            where: { id: { in: variantIds } },
          });
        }

        await tx.product.delete({
          where: { id },
        });
      });

      await logActivity({
        userId: session.user.id,
        action: "DELETE_PRODUCT",
        entityType: "Product",
        entityId: id,
        details: `Deleted product ${id}`,
      });

      revalidatePath("/dashboard/products");
      return null;
    } catch (error) {
      if (error instanceof BusinessRuleError) throw error;
      logger.error("Failed to delete product", {
        error,
        productId: id,
        module: "ProductActions",
      });
      throw new BusinessRuleError(
        "Failed to delete product. Ensure it has no dependencies.",
      );
    }
  });
});

export const deleteVariant = withTenant(async function deleteVariant(
  id: string,
) {
  return safeAction(async () => {
    const session = await requireAuth();
    try {
      const checks = await Promise.all([
        prisma.inventory.count({ where: { productVariantId: id } }),
        prisma.stockMovement.count({ where: { productVariantId: id } }),
        prisma.batch.count({ where: { productVariantId: id } }),
        prisma.bomItem.count({ where: { productVariantId: id } }),
        prisma.materialIssue.count({ where: { productVariantId: id } }),
        prisma.scrapRecord.count({ where: { productVariantId: id } }),
        prisma.stockReservation.count({ where: { productVariantId: id } }),
        prisma.stockOpnameItem.count({ where: { productVariantId: id } }),
        prisma.productionMaterial.count({ where: { productVariantId: id } }),
        prisma.bom.count({ where: { productVariantId: id } }),
      ]);

      const [
        inventoryCount,
        movementCount,
        batchCount,
        bomItemCount,
        materialIssueCount,
        scrapCount,
        reservationCount,
        opnameItemCount,
        productionMaterialCount,
        bomCount,
      ] = checks;

      const referenced: string[] = [];
      if (inventoryCount > 0) referenced.push(`Inventory (${inventoryCount})`);
      if (movementCount > 0)
        referenced.push(`StockMovement (${movementCount})`);
      if (batchCount > 0) referenced.push(`Batch (${batchCount})`);
      if (bomItemCount > 0) referenced.push(`BomItem (${bomItemCount})`);
      if (bomCount > 0) referenced.push(`Bom (${bomCount})`);
      if (materialIssueCount > 0)
        referenced.push(`MaterialIssue (${materialIssueCount})`);
      if (scrapCount > 0) referenced.push(`ScrapRecord (${scrapCount})`);
      if (reservationCount > 0)
        referenced.push(`StockReservation (${reservationCount})`);
      if (opnameItemCount > 0)
        referenced.push(`StockOpnameItem (${opnameItemCount})`);
      if (productionMaterialCount > 0)
        referenced.push(`ProductionMaterial (${productionMaterialCount})`);

      if (referenced.length > 0) {
        throw new BusinessRuleError(
          `Cannot delete variant. It is referenced in: ${referenced.join(", ")}`,
        );
      }

      await prisma.productVariant.delete({ where: { id } });

      await logActivity({
        userId: session.user.id,
        action: "DELETE_PRODUCT_VARIANT",
        entityType: "ProductVariant",
        entityId: id,
        details: `Deleted product variant ${id}`,
      });

      revalidatePath("/dashboard/products");
      return null;
    } catch (error) {
      if (error instanceof BusinessRuleError) throw error;
      logger.error("Failed to delete variant", {
        error,
        variantId: id,
        module: "ProductActions",
      });
      throw new BusinessRuleError(
        "Failed to delete variant. Ensure it has no dependencies.",
      );
    }
  });
});
