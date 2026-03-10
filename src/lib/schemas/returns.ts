import * as z from "zod";
import { ItemCondition, ReturnReason } from "@prisma/client";

// ==========================================
// SALES RETURN SCHEMAS
// ==========================================

export const salesReturnItemSchema = z.object({
  productVariantId: z.string().uuid("Invalid Product Variant ID"),
  returnedQty: z.coerce.number().positive("Quantity must be positive"),
  unitPrice: z.coerce.number().nonnegative("Unit price must be non-negative"),
  reason: z.nativeEnum(ReturnReason).default("OTHER"),
  condition: z.nativeEnum(ItemCondition).default("GOOD"),
  notes: z.string().optional().nullable(),
});

export const createSalesReturnSchema = z.object({
  salesOrderId: z.string().uuid("Invalid Sales Order ID"),
  deliveryOrderId: z.string().uuid("Invalid Delivery Order ID").optional().nullable(),
  customerId: z.string().uuid("Invalid Customer ID").optional().nullable(),
  returnLocationId: z.string().uuid("Return Location is required"),
  reason: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  items: z.array(salesReturnItemSchema).min(1, "At least one item must be returned"),
});

export const updateSalesReturnSchema = createSalesReturnSchema.partial().extend({
  id: z.string().uuid("Invalid Return ID"),
});

export type SalesReturnItemValues = z.infer<typeof salesReturnItemSchema>;
export type CreateSalesReturnValues = z.infer<typeof createSalesReturnSchema>;
export type UpdateSalesReturnValues = z.infer<typeof updateSalesReturnSchema>;

// ==========================================
// PURCHASE RETURN SCHEMAS
// ==========================================

export const purchaseReturnItemSchema = z.object({
  productVariantId: z.string().uuid("Invalid Product Variant ID"),
  returnedQty: z.coerce.number().positive("Quantity must be positive"),
  unitCost: z.coerce.number().nonnegative("Unit price must be non-negative"),
  reason: z.nativeEnum(ReturnReason).default("OTHER"),
  notes: z.string().optional().nullable(),
});

export const createPurchaseReturnSchema = z.object({
  purchaseOrderId: z.string().uuid("Invalid Purchase Order ID"),
  goodsReceiptId: z.string().uuid("Invalid Goods Receipt ID").optional().nullable(),
  supplierId: z.string().uuid("Supplier ID is required"),
  sourceLocationId: z.string().uuid("Source Location is required"),
  reason: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  items: z.array(purchaseReturnItemSchema).min(1, "At least one item must be returned"),
});

export const updatePurchaseReturnSchema = createPurchaseReturnSchema.partial().extend({
  id: z.string().uuid("Invalid Return ID"),
});

export type PurchaseReturnItemValues = z.infer<typeof purchaseReturnItemSchema>;
export type CreatePurchaseReturnValues = z.infer<typeof createPurchaseReturnSchema>;
export type UpdatePurchaseReturnValues = z.infer<typeof updatePurchaseReturnSchema>;
