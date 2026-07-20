import { z } from 'zod';
import { Unit } from '@prisma/client';
import { sanitizeHtml } from '@/lib/utils/sanitize';

// Production Schemas
export const createProductionOrderSchema = z.object({
    orderNumber: z.string().optional(), // Auto-generated if empty
    bomId: z.string().min(1, "BOM is required"),
    plannedQuantity: z.coerce.number().positive("Planned quantity must be positive"),
    plannedEnteredQuantity: z.coerce.number().positive("Entered planned quantity must be positive").optional(),
    plannedEnteredUnit: z.nativeEnum(Unit).optional(),
    plannedConversionFactorSnapshot: z.coerce.number().positive("Planning conversion factor must be positive").optional(),
    plannedStartDate: z.date(),
    plannedEndDate: z.date().optional(),
    locationId: z.string().min(1, "Output location is required"),
    notes: z.string().optional().transform(sanitizeHtml),
    salesOrderId: z.string().optional(),
    machineId: z.string().optional(),

    // Flexible BOM Items
    items: z.array(z.object({
        productVariantId: z.string(),
        quantity: z.coerce.number()
    })).optional(),

    isMaklon: z.boolean().default(false),
    maklonCustomerId: z.string().optional(),
    estimatedConversionCost: z.coerce.number().nonnegative().optional().default(0),
}).superRefine((data, ctx) => {
    if (data.isMaklon && !data.maklonCustomerId) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Customer is required for Maklon orders",
            path: ["maklonCustomerId"],
        });
    }
});

export const updateProductionOrderSchema = z.object({
    id: z.string(),
    status: z.enum(['DRAFT', 'RELEASED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'WAITING_MATERIAL']).optional(),
    actualQuantity: z.coerce.number().nonnegative().optional(),
    actualStartDate: z.date().optional(),
    actualEndDate: z.date().optional(),
    machineId: z.string().optional(),
    /** Output / staging warehouse (WO location) */
    locationId: z.string().min(1).optional(),
    plannedStartDate: z.date().optional(),
});

export const materialIssueSchema = z.object({
    productionOrderId: z.string().min(1, "Production Order ID is required"),
    productVariantId: z.string().min(1, "Material variant is required"),
    locationId: z.string().min(1, "Source location is required"),
    quantity: z.coerce.number().positive("Quantity must be positive"),
    batchId: z.string().optional(),
});

export const scrapRecordSchema = z.object({
    productionOrderId: z.string().min(1, "Production Order ID is required"),
    productVariantId: z.string().min(1, "Scrap variant is required"), // Likely a specific Scrap variant
    locationId: z.string().min(1, "Location is required"),
    quantity: z.coerce.number().positive("Quantity must be positive"),
    reason: z.string().optional().transform(sanitizeHtml),
});

export const qualityInspectionSchema = z.object({
    productionOrderId: z.string().min(1, "Order ID is required"),
    result: z.enum(['PASS', 'FAIL', 'QUARANTINE']),
    notes: z.string().optional().transform(sanitizeHtml),
});

export const batchMaterialIssueSchema = z.object({
    productionOrderId: z.string().min(1, "Production Order ID is required"),
    locationId: z.string().min(1, "Source location is required"),
    items: z.array(z.object({
        productVariantId: z.string().min(1, "Material variant is required"),
        quantity: z.coerce.number().positive("Quantity must be positive"),
        batchId: z.string().optional(), // NEW: Batch selection support
        sourceLocationId: z.string().optional(), // NEW: Per-item location override
    })).min(0, "Items can be empty if only updating plan"),
    removedPlannedMaterialIds: z.array(z.string()).optional(),
    addedPlannedMaterials: z.array(z.object({
        productVariantId: z.string(),
        quantity: z.coerce.number().nonnegative()
    })).optional(),
    requestId: z.string().optional(), // NEW: Idempotency support
});

export type CreateProductionOrderValues = z.infer<typeof createProductionOrderSchema>;
export type UpdateProductionOrderValues = z.infer<typeof updateProductionOrderSchema>;
export type MaterialIssueValues = z.infer<typeof materialIssueSchema>;
export type BatchMaterialIssueValues = z.infer<typeof batchMaterialIssueSchema>;
export type ScrapRecordValues = z.infer<typeof scrapRecordSchema>;
export type QualityInspectionValues = z.infer<typeof qualityInspectionSchema>;

export const adHocMaterialUsageSchema = z.object({
    productionOrderId: z.string().min(1, "Production Order ID is required"),
    productVariantId: z.string().min(1, "Material variant is required"),
    locationId: z.string().min(1, "Source location is required"),
    quantity: z.coerce.number().positive("Quantity must be positive"),
    reason: z.string().max(500).optional(),
    requestId: z.string().optional(),
});

export type AdHocMaterialUsageValues = z.infer<typeof adHocMaterialUsageSchema>;

export const consolidatedBatchMaterialIssueSchema = z.object({
    productionOrderIds: z.array(z.string().min(1)).min(1, "At least one Production Order is required"),
    locationId: z.string().min(1, "Source location is required"),
    items: z.array(z.object({
        productVariantId: z.string().min(1, "Material variant is required"),
        quantity: z.coerce.number().positive("Quantity must be positive"),
    })).min(1, "At least one material item is required"),
    requestId: z.string().optional(),
});

export type ConsolidatedBatchMaterialIssueValues = z.infer<typeof consolidatedBatchMaterialIssueSchema>;

// BOM Management Schemas
export const createBomSchema = z.object({
    name: z.string().min(1, "Recipe name is required").transform(sanitizeHtml),
    productVariantId: z.string().min(1, "Output product is required"),
    outputQuantity: z.coerce.number().positive("Output quantity must be positive"),
    isDefault: z.boolean().default(false),
    category: z.enum(['STANDARD', 'MIXING', 'EXTRUSION', 'PACKING', 'REWORK']).default('STANDARD'),
    items: z.array(z.object({
        productVariantId: z.string().min(1, "Ingredient is required"),
        quantity: z.coerce.number().positive("Quantity must be positive"),
        scrapPercentage: z.coerce.number().min(0).max(100).default(0),
    })).min(1, "At least one ingredient is required"),
});


export type CreateBomValues = z.infer<typeof createBomSchema>;

export const duplicateBomSchema = z.object({
    sourceBomId: z.string().min(1, "Source recipe is required"),
    productVariantId: z.string().min(1, "Output product is required"),
    name: z.string().min(1, "Recipe name is required").transform(sanitizeHtml),
    outputQuantity: z.coerce.number().positive("Output quantity must be positive").optional(),
    quantityScale: z.coerce.number().positive("Scale must be greater than 0").default(1),
    isDefault: z.boolean().default(true),
});

export type DuplicateBomValues = z.infer<typeof duplicateBomSchema>;

export const archiveBomSchema = z.object({
    bomId: z.string().min(1, "Recipe ID is required"),
    newDefaultBomId: z.string().optional(),
});

export type ArchiveBomValues = z.infer<typeof archiveBomSchema>;

export const productionOutputSchema = z.object({
    productionOrderId: z.string().min(1, "Production Order ID is required"),
    // Transform empty string '' → undefined to prevent FK constraint violations in DB
    machineId: z.string().optional().transform(v => v || undefined),
    operatorId: z.string().optional().transform(v => v || undefined),
    helperIds: z.array(z.string()).optional(),
    shiftId: z.string().optional().transform(v => v || undefined),
    quantityProduced: z.coerce.number().nonnegative("Quantity cannot be negative"),
    // UOM audit trail: operator-facing entry details
    enteredQuantity: z.coerce.number().positive("Entered quantity must be positive").optional(),
    enteredUnit: z.nativeEnum(Unit).optional(),
    baseQuantityProduced: z.coerce.number().positive("Base quantity must be positive").optional(),
    conversionFactorSnapshot: z.coerce.number().positive("Conversion factor must be positive").optional(),
    scrapQuantity: z.coerce.number().nonnegative().default(0), // Total Aggregated Scrap (Legacy/KPI)
    scrapProngkolQty: z.coerce.number().nonnegative().default(0),
    scrapDaunQty: z.coerce.number().nonnegative().default(0),
    bruto: z.coerce.number().nonnegative().optional(),
    bobin: z.coerce.number().nonnegative().optional(),
    // Empty string for cekGram should also not be stored in DB
    cekGram: z.string().optional().transform(v => v || undefined),
    startTime: z.coerce.date(),
    endTime: z.coerce.date(),
    notes: z.string().optional().transform(sanitizeHtml),
});

// Production Execution Controls
export const startExecutionSchema = z.object({
    productionOrderId: z.string().min(1, "Production Order ID is required"),
    machineId: z.string().optional(),
    operatorId: z.string().optional(),
    shiftId: z.string().optional(),
});

export const stopExecutionSchema = z.object({
    executionId: z.string().min(1, "Execution ID is required"),
    quantityProduced: z.coerce.number().nonnegative(),
    enteredQuantity: z.coerce.number().positive("Entered quantity must be positive").optional(),
    enteredUnit: z.nativeEnum(Unit).optional(),
    baseQuantityProduced: z.coerce.number().positive("Base quantity must be positive").optional(),
    conversionFactorSnapshot: z.coerce.number().positive("Conversion factor must be positive").optional(),
    scrapQuantity: z.coerce.number().nonnegative().default(0),
    scrapProngkolQty: z.coerce.number().nonnegative().default(0),
    scrapDaunQty: z.coerce.number().nonnegative().default(0),
    notes: z.string().optional().transform(sanitizeHtml),
    completed: z.boolean().optional(),
    operatorId: z.string().optional(),
});

export type StartExecutionValues = z.infer<typeof startExecutionSchema>;
export type StopExecutionValues = z.infer<typeof stopExecutionSchema>;

export const logRunningOutputSchema = z.object({
    executionId: z.string().min(1, "Execution ID is required"),
    quantityProduced: z.coerce.number().nonnegative("Quantity must be zero or positive"),
    enteredQuantity: z.coerce.number().positive("Entered quantity must be positive").optional(),
    enteredUnit: z.nativeEnum(Unit).optional(),
    baseQuantityProduced: z.coerce.number().positive("Base quantity must be positive").optional(),
    conversionFactorSnapshot: z.coerce.number().positive("Conversion factor must be positive").optional(),
    scrapQuantity: z.coerce.number().nonnegative().default(0),
    scrapProngkolQty: z.coerce.number().nonnegative().default(0),
    scrapDaunQty: z.coerce.number().nonnegative().default(0),
    notes: z.string().optional().transform(sanitizeHtml),
    operatorId: z.string().optional(),
    helperIds: z.array(z.string()).optional(),
    photoUrl: z.string().optional(),
});

export type LogRunningOutputValues = z.infer<typeof logRunningOutputSchema>;

export type ProductionOutputValues = z.infer<typeof productionOutputSchema>;

export const logMachineDowntimeSchema = z.object({
    machineId: z.string().min(1, "Machine is required"),
    reason: z.string().min(1, "Reason is required").transform(sanitizeHtml),
    startTime: z.coerce.date(),
    endTime: z.coerce.date().optional(),
});

export type LogMachineDowntimeValues = z.infer<typeof logMachineDowntimeSchema>;

export const splitProductionOrdersSchema = z.object({
    salesOrderId: z.string().min(1, "Sales Order ID is required"),
    productVariantId: z.string().min(1, "Product variant is required"),
    batches: z.array(z.object({
        plannedQuantity: z.coerce.number().positive("Batch planned quantity must be positive"),
        plannedStartDate: z.coerce.date(),
        machineId: z.string().optional(),
    })).min(1, "At least one batch is required"),
});

export type SplitProductionOrdersValues = z.infer<typeof splitProductionOrdersSchema>;
