import { z } from 'zod';
import { Unit, ProductType } from '@prisma/client';

export const productVariantSchema = z.object({
    id: z.string().optional(), // For editing existing variants
    name: z.string().min(1, "Variant name is required"),
    skuCode: z.string()
        .length(8, "SKU must be exactly 8 characters")
        .regex(/^(RM|IN|PK|WP|FG|SC)[A-Z]{3}\d{3}$/,
            "SKU format: [TYPE][CATEGORY][SEQ] (e.g., RMPPG001)")
        .transform(val => val.toUpperCase()),
    primaryUnit: z.nativeEnum(Unit, { message: "Primary unit is required" }),
    salesUnit: z.nativeEnum(Unit).optional().nullable(),
    conversionFactor: z.coerce.number().positive("Conversion factor must be positive").default(1),
    price: z.coerce.number().nonnegative("Price must be non-negative").optional().nullable(),
    minStockAlert: z.coerce.number().nonnegative("Min stock alert must be non-negative").optional().nullable(),
});

export const createProductSchema = z.object({
    name: z.string().min(1, "Product name is required"),
    productType: z.nativeEnum(ProductType, { message: "Product type is required" }),
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

    // Smart logic: For SCRAP and RAW_MATERIAL, auto-set salesUnit = primaryUnit and conversionFactor = 1
    if (data.productType === ProductType.SCRAP || data.productType === ProductType.RAW_MATERIAL) {
        data.variants.forEach((variant) => {
            variant.salesUnit = variant.primaryUnit;
            variant.conversionFactor = 1;
        });
    }
});

export const updateProductSchema = z.object({
    id: z.string(),
    name: z.string().min(1, "Product name is required"),
    productType: z.nativeEnum(ProductType),
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

    // Smart logic for SCRAP and RAW_MATERIAL
    if (data.productType === ProductType.SCRAP || data.productType === ProductType.RAW_MATERIAL) {
        data.variants.forEach((variant) => {
            variant.salesUnit = variant.primaryUnit;
            variant.conversionFactor = 1;
        });
    }
});

export type ProductVariantFormValues = z.infer<typeof productVariantSchema>;
export type CreateProductValues = z.infer<typeof createProductSchema>;
export type UpdateProductValues = z.infer<typeof updateProductSchema>;
