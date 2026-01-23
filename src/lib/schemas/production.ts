import { z } from 'zod';

// Production Schemas
export const createProductionOrderSchema = z.object({
    orderNumber: z.string().optional(), // Auto-generated if empty
    bomId: z.string().min(1, "BOM is required"),
    plannedQuantity: z.coerce.number().positive("Planned quantity must be positive"),
    plannedStartDate: z.date(),
    plannedEndDate: z.date().optional(),
    locationId: z.string().min(1, "Output location is required"),
    notes: z.string().optional(),
    salesOrderId: z.string().optional(),
    machineId: z.string().optional(),

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
    plannedStartDate: z.date().optional(),
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

export const batchMaterialIssueSchema = z.object({
    productionOrderId: z.string().min(1, "Production Order ID is required"),
    locationId: z.string().min(1, "Source location is required"),
    items: z.array(z.object({
        productVariantId: z.string().min(1, "Material variant is required"),
        quantity: z.coerce.number().positive("Quantity must be positive"),
        batchId: z.string().optional(), // NEW: Batch selection support
    })).min(0, "Items can be empty if only updating plan"),
    removedPlannedMaterialIds: z.array(z.string()).optional(),
    addedPlannedMaterials: z.array(z.object({
        productVariantId: z.string(),
        quantity: z.coerce.number().nonnegative()
    })).optional(),
});

export type CreateProductionOrderValues = z.infer<typeof createProductionOrderSchema>;
export type UpdateProductionOrderValues = z.infer<typeof updateProductionOrderSchema>;
export type MaterialIssueValues = z.infer<typeof materialIssueSchema>;
export type BatchMaterialIssueValues = z.infer<typeof batchMaterialIssueSchema>;
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
    scrapQuantity: z.coerce.number().nonnegative().default(0),
    notes: z.string().optional(),
    completed: z.boolean().optional(),
});

export type StartExecutionValues = z.infer<typeof startExecutionSchema>;
export type StopExecutionValues = z.infer<typeof stopExecutionSchema>;

export const logRunningOutputSchema = z.object({
    executionId: z.string().min(1, "Execution ID is required"),
    quantityProduced: z.coerce.number().positive("Quantity must be positive"),
    scrapQuantity: z.coerce.number().nonnegative().default(0),
    notes: z.string().optional(),
});

export type LogRunningOutputValues = z.infer<typeof logRunningOutputSchema>;

export type ProductionOutputValues = z.infer<typeof productionOutputSchema>;

export const logMachineDowntimeSchema = z.object({
    machineId: z.string().min(1, "Machine is required"),
    reason: z.string().min(1, "Reason is required"),
    startTime: z.coerce.date(),
    endTime: z.coerce.date().optional(),
});

export type LogMachineDowntimeValues = z.infer<typeof logMachineDowntimeSchema>;
