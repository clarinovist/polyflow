import { z } from 'zod';
import { MovementType, ProductType, Unit } from '@prisma/client';

export const transferStockSchema = z.object({
    sourceLocationId: z.string().min(1, "Source location is required"),
    destinationLocationId: z.string().min(1, "Destination location is required"),
    productVariantId: z.string().min(1, "Product is required"),
    quantity: z.coerce.number().positive("Quantity must be positive"),
    notes: z.string().optional(),
    date: z.date().default(() => new Date()),
}).refine((data) => data.sourceLocationId !== data.destinationLocationId, {
    message: "Source and destination cannot be the same",
    path: ["destinationLocationId"],
});

export const adjustStockSchema = z.object({
    locationId: z.string().min(1, "Location is required"),
    productVariantId: z.string().min(1, "Product is required"),
    type: z.enum(['ADJUSTMENT_IN', 'ADJUSTMENT_OUT'] as const),
    quantity: z.coerce.number().positive("Quantity must be positive"),
    reason: z.string().min(3, "Reason is required"),
});

export type TransferStockValues = z.infer<typeof transferStockSchema>;
export type AdjustStockValues = z.infer<typeof adjustStockSchema>;

// Product Management Schemas
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
    buyPrice: z.coerce.number().nonnegative("Buy price must be non-negative").optional().nullable(),
    sellPrice: z.coerce.number().nonnegative("Sell price must be non-negative").optional().nullable(),
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
        data.variants.forEach((variant, index) => {
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

// Production Schemas
export const createProductionOrderSchema = z.object({
    orderNumber: z.string().optional(), // Auto-generated if empty
    bomId: z.string().min(1, "BOM is required"),
    plannedQuantity: z.coerce.number().positive("Planned quantity must be positive"),
    plannedStartDate: z.date(),
    plannedEndDate: z.date().optional(),
    locationId: z.string().min(1, "Output location is required"),

    // Flexible BOM Items
    items: z.array(z.object({
        productVariantId: z.string(),
        quantity: z.coerce.number()
    })).optional(),
});

export const updateProductionOrderSchema = z.object({
    id: z.string(),
    status: z.enum(['DRAFT', 'RELEASED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
    actualQuantity: z.coerce.number().nonnegative().optional(),
    actualStartDate: z.date().optional(),
    actualEndDate: z.date().optional(),
    machineId: z.string().optional(),
});

export const materialIssueSchema = z.object({
    productionOrderId: z.string().min(1, "Production Order ID is required"),
    productVariantId: z.string().min(1, "Material variant is required"),
    locationId: z.string().min(1, "Source location is required"),
    quantity: z.coerce.number().positive("Quantity must be positive"),
});

export const scrapRecordSchema = z.object({
    productionOrderId: z.string().min(1, "Production Order ID is required"),
    productVariantId: z.string().min(1, "Scrap variant is required"), // Likely a specific Scrap variant
    locationId: z.string().min(1, "Location is required"),
    quantity: z.coerce.number().positive("Quantity must be positive"),
    reason: z.string().optional(),
});

export const qualityInspectionSchema = z.object({
    productionOrderId: z.string().min(1, "Order ID is required"),
    result: z.enum(['PASS', 'FAIL', 'QUARANTINE']),
    notes: z.string().optional(),
});

export type CreateProductionOrderValues = z.infer<typeof createProductionOrderSchema>;
export type UpdateProductionOrderValues = z.infer<typeof updateProductionOrderSchema>;
export type MaterialIssueValues = z.infer<typeof materialIssueSchema>;
export type ScrapRecordValues = z.infer<typeof scrapRecordSchema>;
export type QualityInspectionValues = z.infer<typeof qualityInspectionSchema>;

// BOM Management Schemas
export const createBomSchema = z.object({
    name: z.string().min(1, "Recipe name is required"),
    productVariantId: z.string().min(1, "Output product is required"),
    outputQuantity: z.coerce.number().positive("Output quantity must be positive"),
    isDefault: z.boolean().default(false),
    items: z.array(z.object({
        productVariantId: z.string().min(1, "Ingredient is required"),
        quantity: z.coerce.number().positive("Quantity must be positive"),
    })).min(1, "At least one ingredient is required"),
});


export type CreateBomValues = z.infer<typeof createBomSchema>;

export const productionOutputSchema = z.object({
    productionOrderId: z.string().min(1, "Production Order ID is required"),
    machineId: z.string().optional(),
    operatorId: z.string().optional(),
    shiftId: z.string().optional(),
    quantityProduced: z.coerce.number().positive("Quantity must be positive"),
    scrapQuantity: z.coerce.number().nonnegative().default(0), // Total Aggregated Scrap (Legacy/KPI)
    scrapProngkolQty: z.coerce.number().nonnegative().default(0),
    scrapDaunQty: z.coerce.number().nonnegative().default(0),
    startTime: z.coerce.date(),
    endTime: z.coerce.date(),
    notes: z.string().optional(),
});

export type ProductionOutputValues = z.infer<typeof productionOutputSchema>;

