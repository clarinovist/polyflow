import { z } from 'zod';
import { Unit, ProductType, AssetCategory } from '@prisma/client';
import { PRODUCT_CONSTANTS } from '@/lib/constants/products';

const consumptionRuleSchema = z.enum(['PROPORTIONAL', 'FLOOR_ENTERED_BAL', 'CEIL_ENTERED_BAL']);

export const productVariantSchema = z.object({
    id: z.string().optional(), // For editing existing variants
    name: z.string().min(1, "Variant name is required"),
    skuCode: z.string()
        .min(5, "SKU must be at least 5 characters")
        .max(20, "SKU must be at most 20 characters")
        .regex(PRODUCT_CONSTANTS.SKU_REGEX, PRODUCT_CONSTANTS.SKU_HELPER_TEXT)
        .transform(val => val.toUpperCase()),
    primaryUnit: z.nativeEnum(Unit, { message: "Primary unit is required" }),
    salesUnit: z.nativeEnum(Unit).optional().nullable(),
    conversionFactor: z.coerce.number().positive("Conversion factor must be positive").default(1),
    price: z.coerce.number().nonnegative("Price must be non-negative").optional().nullable(),
    buyPrice: z.coerce.number().nonnegative("Buy price must be non-negative").optional().nullable(),
    minStockAlert: z.coerce.number().nonnegative("Min stock alert must be non-negative").optional().nullable(),
    consumptionRule: consumptionRuleSchema.optional().nullable(),
});

export const createProductSchema = z.object({
    name: z.string().min(1, "Product name is required"),
    productType: z.nativeEnum(ProductType, { message: "Product type is required" }),
    assetCategory: z.nativeEnum(AssetCategory).optional().nullable(),
    usefulLifeMonths: z.coerce.number().int().min(1).max(1200).optional().nullable(),
    inventoryAccountId: z.string().optional().nullable(),
    variants: z.array(productVariantSchema).min(1, "At least one variant is required"),
}).superRefine((data, ctx) => {
    // Check for duplicate SKU codes within variants
    const skuCodes = data.variants.map(v => v.skuCode.toLowerCase());
    const duplicates = skuCodes.filter((sku, index) => skuCodes.indexOf(sku) !== index);

    if (duplicates.length > 0) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Duplicate SKU codes found: ${duplicates.join(', ')}`,
            path: ['variants'],
        });
    }

    if (data.productType === ProductType.FIXED_ASSET) {
        if (!data.assetCategory) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Kategori aset wajib untuk tipe Aset Tetap',
                path: ['assetCategory'],
            });
        }
        if (!data.inventoryAccountId) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Akun Aset Tetap wajib untuk tipe Aset Tetap',
                path: ['inventoryAccountId'],
            });
        }
    }

    // Smart logic: For SCRAP and RAW_MATERIAL, auto-set salesUnit = primaryUnit and conversionFactor = 1
    if (data.productType === ProductType.SCRAP || data.productType === ProductType.RAW_MATERIAL) {
        data.variants.forEach((variant) => {
            variant.salesUnit = variant.primaryUnit;
            variant.conversionFactor = 1;
        });
    }

    if (data.productType !== ProductType.PACKAGING) {
        data.variants.forEach((variant) => {
            variant.consumptionRule = null;
        });
    }
});

export const updateProductSchema = z.object({
    id: z.string(),
    name: z.string().min(1, "Product name is required"),
    productType: z.nativeEnum(ProductType),
    assetCategory: z.nativeEnum(AssetCategory).optional().nullable(),
    usefulLifeMonths: z.coerce.number().int().min(1).max(1200).optional().nullable(),
    inventoryAccountId: z.string().optional().nullable(),
    variants: z.array(productVariantSchema).min(1, "At least one variant is required"),
}).superRefine((data, ctx) => {
    // Check for duplicate SKU codes
    const skuCodes = data.variants.map(v => v.skuCode.toLowerCase());
    const duplicates = skuCodes.filter((sku, index) => skuCodes.indexOf(sku) !== index);

    if (duplicates.length > 0) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Duplicate SKU codes found: ${duplicates.join(', ')}`,
            path: ['variants'],
        });
    }

    if (data.productType === ProductType.FIXED_ASSET) {
        if (!data.assetCategory) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Kategori aset wajib untuk tipe Aset Tetap',
                path: ['assetCategory'],
            });
        }
        if (!data.inventoryAccountId) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Akun Aset Tetap wajib untuk tipe Aset Tetap',
                path: ['inventoryAccountId'],
            });
        }
    }

    // Smart logic for SCRAP and RAW_MATERIAL
    if (data.productType === ProductType.SCRAP || data.productType === ProductType.RAW_MATERIAL) {
        data.variants.forEach((variant) => {
            variant.salesUnit = variant.primaryUnit;
            variant.conversionFactor = 1;
        });
    }

    if (data.productType !== ProductType.PACKAGING) {
        data.variants.forEach((variant) => {
            variant.consumptionRule = null;
        });
    }
});

export type ProductVariantFormValues = z.infer<typeof productVariantSchema>;
export type CreateProductValues = z.infer<typeof createProductSchema>;
export type UpdateProductValues = z.infer<typeof updateProductSchema>;
