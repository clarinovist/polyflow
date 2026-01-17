import { z } from 'zod';

export const createSupplierSchema = z.object({
    name: z.string().min(1, "Name is required"),
    code: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional().or(z.literal("")),
    address: z.string().optional(),
    taxId: z.string().optional(),
    paymentTermDays: z.coerce.number().int().nonnegative().optional(),
    bankName: z.string().optional(),
    bankAccount: z.string().optional(),
    notes: z.string().optional(),
});

export const updateSupplierSchema = createSupplierSchema.partial().extend({
    id: z.string(),
});

export const createCustomerSchema = z.object({
    name: z.string().min(1, "Name is required"),
    code: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional().or(z.literal("")),
    billingAddress: z.string().optional(),
    shippingAddress: z.string().optional(),
    taxId: z.string().optional(),
    creditLimit: z.coerce.number().nonnegative().optional(),
    paymentTermDays: z.coerce.number().int().nonnegative().optional(),
    discountPercent: z.coerce.number().min(0).max(100).optional(),
    notes: z.string().optional(),
});

export const updateCustomerSchema = createCustomerSchema.partial().extend({
    id: z.string(),
});

export type CreateSupplierValues = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierValues = z.infer<typeof updateSupplierSchema>;
export type CreateCustomerValues = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerValues = z.infer<typeof updateCustomerSchema>;
