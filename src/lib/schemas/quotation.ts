import { z } from 'zod';
import { SalesQuotationStatus, Unit } from '@prisma/client';

export const salesQuotationItemSchema = z.object({
    id: z.string().optional(),
    productVariantId: z.string().min(1, "Product is required"),
    quantity: z.coerce.number().positive("Quantity must be positive"),
    unitPrice: z.coerce.number().nonnegative("Unit price must be non-negative"),
    enteredQuantity: z.coerce.number().positive("Entered quantity must be positive").optional(),
    enteredUnit: z.nativeEnum(Unit).optional(),
    conversionFactorSnapshot: z.coerce.number().positive("Conversion factor must be positive").optional(),
    enteredUnitPrice: z.coerce.number().nonnegative("Entered unit price must be non-negative").optional(),
    discountPercent: z.coerce.number().min(0).max(100).optional().default(0),
    taxPercent: z.coerce.number().min(0).max(100).optional().default(0),
});

export const createSalesQuotationSchema = z.object({
    customerId: z.string().optional(),
    quotationDate: z.coerce.date(),
    validUntil: z.coerce.date().optional().nullable(),
    notes: z.string().optional().nullable(),
    subject: z.string().optional().nullable(),
    paymentTerms: z.string().optional().nullable(),
    shippingTerms: z.string().optional().nullable(),
    termsConditions: z.string().optional().nullable(),
    items: z.array(salesQuotationItemSchema).min(1, "At least one item is required"),
});

export const updateSalesQuotationSchema = createSalesQuotationSchema.extend({
    id: z.string().min(1, "ID is required"),
    status: z.nativeEnum(SalesQuotationStatus).optional(),
});

export type CreateSalesQuotationValues = z.infer<typeof createSalesQuotationSchema>;
export type UpdateSalesQuotationValues = z.infer<typeof updateSalesQuotationSchema>;
