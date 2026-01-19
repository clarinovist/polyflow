import { z } from 'zod';
import { SalesOrderType } from '@prisma/client';

export const salesOrderItemSchema = z.object({
    id: z.string().optional(),
    productVariantId: z.string().min(1, "Product is required"),
    quantity: z.coerce.number().positive("Quantity must be positive"),
    unitPrice: z.coerce.number().nonnegative("Unit price must be non-negative"),
});

export const createSalesOrderSchema = z.object({
    customerId: z.string().optional(),
    sourceLocationId: z.string().min(1, "Source location is required"),
    orderDate: z.coerce.date(),
    expectedDate: z.coerce.date().optional().nullable(),
    orderType: z.nativeEnum(SalesOrderType).default(SalesOrderType.MAKE_TO_STOCK),
    notes: z.string().optional(),
    items: z.array(salesOrderItemSchema).min(1, "At least one item is required"),
}).superRefine((data, ctx) => {
    if (data.orderType === SalesOrderType.MAKE_TO_ORDER && !data.customerId) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Customer is required for Make to Order",
            path: ["customerId"],
        });
    }
});

export const updateSalesOrderSchema = z.object({
    id: z.string(),
    customerId: z.string().optional(),
    sourceLocationId: z.string().min(1, "Source location is required"),
    orderDate: z.coerce.date(),
    expectedDate: z.coerce.date().optional().nullable(),
    notes: z.string().optional(),
    items: z.array(salesOrderItemSchema).min(1, "At least one item is required"),
});

export const confirmSalesOrderSchema = z.object({
    id: z.string(),
});

export const shipSalesOrderSchema = z.object({
    id: z.string(),
});

export const cancelSalesOrderSchema = z.object({
    id: z.string(),
    reason: z.string().optional(), // For audit log?
});

export type SalesOrderItemValues = z.infer<typeof salesOrderItemSchema>;
export type CreateSalesOrderValues = z.infer<typeof createSalesOrderSchema>;
export type UpdateSalesOrderValues = z.infer<typeof updateSalesOrderSchema>;
