import { z } from "zod";
import { SalesOrderType, Unit } from "@prisma/client";
import { sanitizeHtml } from "@/lib/utils/sanitize";

export const salesOrderItemSchema = z.object({
  id: z.string().optional(),
  productVariantId: z.string().min(1, "Product is required"),
  quantity: z.coerce.number().positive("Quantity must be positive"),
  unitPrice: z.coerce.number().nonnegative("Unit price must be non-negative"),
  enteredQuantity: z.coerce
    .number()
    .positive("Entered quantity must be positive")
    .optional(),
  enteredUnit: z.nativeEnum(Unit).optional(),
  conversionFactorSnapshot: z.coerce
    .number()
    .positive("Conversion factor must be positive")
    .optional(),
  enteredUnitPrice: z.coerce
    .number()
    .nonnegative("Entered unit price must be non-negative")
    .optional(),
  discountPercent: z.coerce.number().min(0).max(100).optional().default(0),
  taxPercent: z.coerce.number().min(0).max(100).optional().default(0),
  dppOtherAmount: z.coerce.number().min(0).optional().nullable().default(null),
  ppnMode: z.enum(['INCLUDE', 'EXCLUDE']).optional().default('EXCLUDE'),
});

export const customItemSchema = z.object({
  tempId: z.string(),
  name: z.string().min(1, "Product name is required"),
  sellPrice: z.coerce.number().min(0).optional().default(0),
});

export const createSalesOrderSchema = z
  .object({
    customerId: z.string().optional(),
    sourceLocationId: z.string().optional().default(""),
    orderDate: z.coerce.date(),
    expectedDate: z.coerce.date().optional().nullable(),
    orderType: z
      .nativeEnum(SalesOrderType)
      .default(SalesOrderType.MAKE_TO_STOCK),
    notes: z.string().optional().transform(sanitizeHtml),
    shippingCost: z.coerce.number().min(0).optional().default(0),
    items: z
      .array(salesOrderItemSchema)
      .min(1, "At least one item is required"),
    customItems: z.array(customItemSchema).optional().default([]),
  })
  .superRefine((data, ctx) => {
    if (data.orderType === SalesOrderType.MAKE_TO_STOCK && !data.customerId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Customer is required for Sales Orders. Use Production Order for internal stock build.",
        path: ["customerId"],
      });
    }

    if (
      (data.orderType === SalesOrderType.MAKE_TO_ORDER ||
        data.orderType === SalesOrderType.MAKLON_JASA) &&
      !data.customerId
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Customer is required for Make to Order / Maklon Jasa",
        path: ["customerId"],
      });
    }

    // Maklon Jasa still requires a source location (customer-owned warehouse)
    if (data.orderType === SalesOrderType.MAKLON_JASA && !data.sourceLocationId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Source location is required for Maklon Jasa orders",
        path: ["sourceLocationId"],
      });
    }
  });

export const updateSalesOrderSchema = z.object({
  id: z.string(),
  customerId: z.string().optional(),
  sourceLocationId: z.string().optional().default(""),
  orderDate: z.coerce.date(),
  expectedDate: z.coerce.date().optional().nullable(),
  notes: z.string().optional().transform(sanitizeHtml),
  shippingCost: z.coerce.number().min(0).optional().default(0),
  items: z.array(salesOrderItemSchema).min(1, "At least one item is required"),
});

export const confirmSalesOrderSchema = z.object({
  id: z.string(),
});

export const shipSalesOrderSchema = z.object({
  id: z.string(),
  trackingNumber: z.string().optional().transform(sanitizeHtml),
  carrier: z.string().optional().transform(sanitizeHtml),
});

export const cancelSalesOrderSchema = z.object({
  id: z.string(),
  reason: z.string().optional().transform(sanitizeHtml), // For audit log
});

export const createManualDeliveryOrderSchema = z.object({
  salesOrderId: z.string().min(1, "Sales Order is required"),
  sourceLocationId: z.string().min(1, "Source location is required"),
  carrier: z.string().optional().transform(sanitizeHtml),
  trackingNumber: z.string().optional().transform(sanitizeHtml),
  notes: z.string().optional().transform(sanitizeHtml),
  vehicleId: z.string().optional(),
  appliedRateType: z.enum(["PER_KG", "FLAT_RATE"]).optional(),
  appliedCostRate: z.coerce.number().min(0).optional(),
  appliedChargeRate: z.coerce.number().min(0).optional(),
  totalCost: z.coerce.number().min(0).optional(),
  totalCharge: z.coerce.number().min(0).optional(),
});

export type SalesOrderItemValues = z.infer<typeof salesOrderItemSchema>;
export type CreateSalesOrderValues = z.infer<typeof createSalesOrderSchema>;
export type ShipSalesOrderValues = z.infer<typeof shipSalesOrderSchema>;
export type UpdateSalesOrderValues = z.infer<typeof updateSalesOrderSchema>;
export type CreateManualDeliveryOrderValues = z.infer<typeof createManualDeliveryOrderSchema>;

// ==========================================
// VEHICLE / ARMADA SCHEMAS
// ==========================================

export const createVehicleSchema = z.object({
  plateNumber: z.string().min(1, "No. polisi harus diisi"),
  name: z.string().min(1, "Nama kendaraan harus diisi"),
  vehicleType: z.enum(["MOBIL_BOX", "L300", "COLD_CONTAINER", "TRONTON", "MOTOR", "OTHER"]),
  ownershipType: z.enum(["FACTORY", "PRIVATE"]),
  ownerName: z.string().optional(),
  driverName: z.string().optional(),
  // coerce: HTML number inputs and server-action payloads often arrive as strings
  capacityKg: z.coerce.number().min(0).optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE", "MAINTENANCE"]),
  notes: z.string().optional(),
});

export const updateVehicleSchema = createVehicleSchema;

// ==========================================
// VEHICLE TARIFF SCHEMAS
// ==========================================

export const createVehicleTariffSchema = z.object({
  vehicleId: z.string().min(1, "Kendaraan harus dipilih"),
  rateType: z.enum(["PER_KG", "FLAT_RATE"]),
  costRate: z.coerce.number().min(0, "Biaya operasional tidak boleh negatif"),
  chargeRate: z.coerce.number().min(0, "Biaya ke customer tidak boleh negatif"),
  routeName: z.string().optional().nullable(),
  minKg: z.coerce.number().min(0).optional().nullable(),
  // coerce.date: Dates become ISO strings when passed through server actions
  validFrom: z.coerce.date(),
  validUntil: z.coerce.date().optional().nullable(),
  notes: z.string().optional(),
});

export const updateVehicleTariffSchema = createVehicleTariffSchema;

export type CreateVehicleValues = z.infer<typeof createVehicleSchema>;
export type CreateVehicleTariffValues = z.infer<typeof createVehicleTariffSchema>;
