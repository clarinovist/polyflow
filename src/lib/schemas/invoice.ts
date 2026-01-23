import { z } from 'zod';
import { InvoiceStatus } from '@prisma/client';

export const createInvoiceSchema = z.object({
    salesOrderId: z.string().uuid("Invalid sales order ID"),
    invoiceDate: z.date(),
    dueDate: z.date().optional(),
    termOfPaymentDays: z.coerce.number().min(0).default(0),
    notes: z.string().optional(),
});

export const updateInvoiceStatusSchema = z.object({
    id: z.string().uuid(),
    status: z.nativeEnum(InvoiceStatus),
    paidAmount: z.number().min(0).optional(),
});

export type CreateInvoiceValues = z.infer<typeof createInvoiceSchema>;
export type UpdateInvoiceStatusValues = z.infer<typeof updateInvoiceStatusSchema>;
