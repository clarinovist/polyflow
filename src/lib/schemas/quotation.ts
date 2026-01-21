import { z } from 'zod';
import { SalesQuotationStatus } from '@prisma/client';

export const salesQuotationItemSchema = z.object({
    id: z.string().optional(),
    productVariantId: z.string().min(1, "Product is required"),
    quantity: z.coerce.number().positive("Quantity must be positive"),
    unitPrice: z.coerce.number().nonnegative("Unit price must be non-negative"),
    discountPercent: z.coerce.number().min(0).max(100).optional().default(0),
    taxPercent: z.coerce.number().min(0).max(100).optional().default(0),
});

export const createSalesQuotationSchema = z.object({
    customerId: z.string().optional(), // Can be optional if new customer not yet in system? Usually required. Let's make it optional for now, similar to orders? No, orders have customerId optional? Let's check sales schema.
    quotationDate: z.coerce.date(),
    validUntil: z.coerce.date().optional(),
    notes: z.string().optional(),
    items: z.array(salesQuotationItemSchema).min(1, "At least one item is required"),
});

export const updateSalesQuotationSchema = createSalesQuotationSchema.extend({
    id: z.string().min(1, "ID is required"),
    status: z.nativeEnum(SalesQuotationStatus).optional(),
});

export type CreateSalesQuotationValues = z.infer<typeof createSalesQuotationSchema>;
export type UpdateSalesQuotationValues = z.infer<typeof updateSalesQuotationSchema>;
