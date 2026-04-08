import { z } from 'zod';
import { ReservationType } from '@prisma/client';
import { sanitizeHtml } from '@/lib/utils/sanitize';

// Stock Reservation Schemas
export const createReservationSchema = z.object({
    productVariantId: z.string().min(1, "Product variant is required"),
    locationId: z.string().min(1, "Location is required"),
    quantity: z.coerce.number().positive("Quantity must be positive"),
    reservedFor: z.nativeEnum(ReservationType, { message: "Reservation type is required" }),
    referenceId: z.string().min(1, "Reference ID is required").transform(sanitizeHtml),
    reservedUntil: z.date().optional(),
});

export const cancelReservationSchema = z.object({
    reservationId: z.string().min(1, "Reservation ID is required"),
});

// Batch Creation Schema
export const createBatchSchema = z.object({
    batchNumber: z.string().min(1, "Batch number is required").transform(sanitizeHtml),
    productVariantId: z.string().min(1, "Product variant is required"),
    locationId: z.string().min(1, "Location is required"),
    quantity: z.coerce.number().positive("Quantity must be positive"),
    manufacturingDate: z.date(),
    expiryDate: z.date().optional(),
});

export type CreateReservationValues = z.infer<typeof createReservationSchema>;
export type CancelReservationValues = z.infer<typeof cancelReservationSchema>;
export type CreateBatchValues = z.infer<typeof createBatchSchema>;

export const transferStockSchema = z.object({
    sourceLocationId: z.string().min(1, "Source location is required"),
    destinationLocationId: z.string().min(1, "Destination location is required"),
    productVariantId: z.string().min(1, "Product is required"),
    quantity: z.coerce.number().positive("Quantity must be positive"),
    notes: z.string().optional().transform(sanitizeHtml),
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
    reason: z.string().min(3, "Reason is required").transform(sanitizeHtml),
});

// Extended Adjust Stock (with batch)
export const adjustStockWithBatchSchema = adjustStockSchema.extend({
    unitCost: z.coerce.number().positive().optional(),
    batchData: z.object({
        batchNumber: z.string().min(1, "Batch number is required").transform(sanitizeHtml),
        manufacturingDate: z.date(),
        expiryDate: z.date().optional(),
    }).optional(),
});

export type AdjustStockWithBatchValues = z.infer<typeof adjustStockWithBatchSchema>;

export type TransferStockValues = z.infer<typeof transferStockSchema>;
export type AdjustStockValues = z.infer<typeof adjustStockSchema>;

export const bulkTransferStockSchema = z.object({
    sourceLocationId: z.string().min(1, "Source location is required"),
    destinationLocationId: z.string().min(1, "Destination location is required"),
    items: z.array(z.object({
        productVariantId: z.string().min(1, "Product is required"),
        quantity: z.coerce.number().positive("Quantity must be positive"),
    })).min(1, "At least one item is required"),
    notes: z.string().optional().transform(sanitizeHtml),
    date: z.date().default(() => new Date()),
}).refine((data) => data.sourceLocationId !== data.destinationLocationId, {
    message: "Source and destination cannot be the same",
    path: ["destinationLocationId"],
});

export const bulkAdjustStockSchema = z.object({
    locationId: z.string().min(1, "Location is required"),
    items: z.array(z.object({
        productVariantId: z.string().min(1, "Product is required"),
        type: z.enum(['ADJUSTMENT_IN', 'ADJUSTMENT_OUT'] as const),
        quantity: z.coerce.number().positive("Quantity must be positive"),
        reason: z.string().min(3, "Reason is required").transform(sanitizeHtml),
        unitCost: z.coerce.number().positive().optional(),
    })).min(1, "At least one item is required"),
});

export type BulkTransferStockValues = z.infer<typeof bulkTransferStockSchema>;
export type BulkAdjustStockValues = z.infer<typeof bulkAdjustStockSchema>;

// Location Schemas
export const createLocationSchema = z.object({
    name: z.string().min(1, "Location name is required").transform(sanitizeHtml),
    slug: z.string().optional().transform(slug => slug ? sanitizeHtml(slug) : undefined),
    description: z.string().optional().transform(desc => desc ? sanitizeHtml(desc) : undefined),
    locationType: z.enum(['INTERNAL', 'CUSTOMER_OWNED'] as const),
});

export const updateLocationSchema = createLocationSchema;

export type CreateLocationValues = z.infer<typeof createLocationSchema>;
export type UpdateLocationValues = z.infer<typeof updateLocationSchema>;

