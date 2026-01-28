import { z } from 'zod';

export const purchaseOrderItemSchema = z.object({
    id: z.string().optional(),
    productVariantId: z.string().min(1, "Product is required"),
    quantity: z.coerce.number().positive("Quantity must be positive"),
    unitPrice: z.coerce.number().positive("Unit price must be positive"),
});

export const createPurchaseOrderSchema = z.object({
    supplierId: z.string().min(1, "Supplier is required"),
    orderDate: z.coerce.date(),
    expectedDate: z.coerce.date().optional().nullable(),
    notes: z.string().optional(),
    items: z.array(purchaseOrderItemSchema).min(1, "At least one item is required"),
});

export const updatePurchaseOrderSchema = z.object({
    id: z.string(),
    supplierId: z.string().min(1, "Supplier is required"),
    orderDate: z.coerce.date(),
    expectedDate: z.coerce.date().optional().nullable(),
    notes: z.string().optional(),
    items: z.array(purchaseOrderItemSchema).min(1, "At least one item is required"),
});

export const goodsReceiptItemSchema = z.object({
    productVariantId: z.string().min(1, "Product is required"),
    receivedQty: z.coerce.number().positive("Quantity must be positive"),
    unitCost: z.coerce.number().positive("Unit cost must be positive"),
});

export const createGoodsReceiptSchema = z.object({
    purchaseOrderId: z.string().min(1, "PO ID is required"),
    receivedDate: z.coerce.date(),
    locationId: z.string().min(1, "Location is required"),
    notes: z.string().optional(),
    items: z.array(goodsReceiptItemSchema).min(1, "At least one item is required"),
});

export const createPurchaseInvoiceSchema = z.object({
    purchaseOrderId: z.string().min(1, "PO ID is required"),
    invoiceNumber: z.string().min(1, "Invoice number is required"),
    invoiceDate: z.coerce.date(),
    dueDate: z.coerce.date().optional().nullable(),
    termOfPaymentDays: z.coerce.number().min(0).default(0),
    notes: z.string().optional(),
});


export const purchaseRequestItemSchema = z.object({
    productVariantId: z.string().min(1, "Product is required"),
    quantity: z.coerce.number().positive("Quantity must be positive"),
    notes: z.string().optional(),
});

export const createPurchaseRequestSchema = z.object({
    salesOrderId: z.string().optional(),
    priority: z.enum(['NORMAL', 'URGENT']).default('NORMAL'),
    notes: z.string().optional(),
    items: z.array(purchaseRequestItemSchema).min(1, "At least one item is required"),
});

export type PurchaseOrderItemValues = z.infer<typeof purchaseOrderItemSchema>;
export type CreatePurchaseOrderValues = z.infer<typeof createPurchaseOrderSchema>;
export type UpdatePurchaseOrderValues = z.infer<typeof updatePurchaseOrderSchema>;
export type GoodsReceiptItemValues = z.infer<typeof goodsReceiptItemSchema>;
export type CreateGoodsReceiptValues = z.infer<typeof createGoodsReceiptSchema>;
export type CreatePurchaseInvoiceValues = z.infer<typeof createPurchaseInvoiceSchema>;

export type PurchaseRequestItemValues = z.infer<typeof purchaseRequestItemSchema>;
export type CreatePurchaseRequestValues = z.infer<typeof createPurchaseRequestSchema>;
