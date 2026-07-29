import { z } from 'zod';

const codeSchema = z
  .string()
  .trim()
  .min(2)
  .max(30)
  .regex(/^[A-Z0-9_]+$/, 'Code harus huruf besar/angka/underscore');

export const createProductionProcessSchema = z.object({
  code: codeSchema,
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional().nullable(),
  requiresMachine: z.boolean().default(false),
  requiresQualityGate: z.boolean().default(false),
});

export const updateProductionProcessSchema = z.object({
  id: z.string().uuid(),
  code: codeSchema.optional(),
  name: z.string().trim().min(2).max(100).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  requiresMachine: z.boolean().optional(),
  requiresQualityGate: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const createRouteSchema = z.object({
  code: z.string().trim().min(2).max(50).optional(),
  name: z.string().trim().min(2).max(120),
  productVariantId: z.string().uuid(),
  isDefault: z.boolean().default(false),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const updateRouteSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).max(120).optional(),
  isDefault: z.boolean().optional(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const createRouteStepSchema = z.object({
  routeId: z.string().uuid(),
  stepCode: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[A-Z0-9_]+$/, 'stepCode huruf besar/angka/underscore'),
  label: z.string().trim().min(2).max(120),
  processId: z.string().uuid(),
  bomId: z.string().uuid(),
  materialSourceLocationId: z.string().uuid().optional().nullable(),
  outputLocationId: z.string().uuid().optional().nullable(),
  requiresQualityGate: z.boolean().default(false),
  allowsPartialHandoff: z.boolean().default(false),
  queueTimeMinutes: z.number().int().min(0).max(10080).optional().nullable(),
  setupTimeMinutes: z.number().int().min(0).max(10080).optional().nullable(),
});

export const updateRouteStepSchema = z.object({
  id: z.string().uuid(),
  stepCode: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[A-Z0-9_]+$/, 'stepCode huruf besar/angka/underscore')
    .optional(),
  label: z.string().trim().min(2).max(120).optional(),
  processId: z.string().uuid().optional(),
  bomId: z.string().uuid().optional(),
  materialSourceLocationId: z.string().uuid().optional().nullable(),
  outputLocationId: z.string().uuid().optional().nullable(),
  requiresQualityGate: z.boolean().optional(),
  allowsPartialHandoff: z.boolean().optional(),
  queueTimeMinutes: z.number().int().min(0).max(10080).optional().nullable(),
  setupTimeMinutes: z.number().int().min(0).max(10080).optional().nullable(),
  sequence: z.number().int().min(0).optional(),
});

export const reorderRouteStepsSchema = z.object({
  routeId: z.string().uuid(),
  orderedIds: z.array(z.string().uuid()).min(1),
});

export const createProductionRunSchema = z.object({
  routeId: z.string().uuid(),
  plannedQuantity: z.number().positive(),
  salesOrderId: z.string().uuid().optional().nullable(),
  priority: z.enum(['URGENT', 'NORMAL', 'LOW']).default('NORMAL'),
  plannedStartDate: z.coerce.date().optional().nullable(),
  plannedEndDate: z.coerce.date().optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  idempotencyKey: z.string().trim().min(4).max(100).optional().nullable(),
});

export const cancelProductionRunSchema = z.object({
  id: z.string().uuid(),
  force: z.boolean().default(false).optional(),
  reason: z.string().trim().max(500).optional().nullable(),
});

export const createMachineCapabilitySchema = z.object({
  machineId: z.string().uuid(),
  processId: z.string().uuid(),
  isPrimary: z.boolean().default(false),
});

export type CreateProductionProcessValues = z.infer<typeof createProductionProcessSchema>;
export type UpdateProductionProcessValues = z.infer<typeof updateProductionProcessSchema>;
export type CreateRouteValues = z.infer<typeof createRouteSchema>;
export type UpdateRouteValues = z.infer<typeof updateRouteSchema>;
export type CreateRouteStepValues = z.infer<typeof createRouteStepSchema>;
export type UpdateRouteStepValues = z.infer<typeof updateRouteStepSchema>;
export type ReorderRouteStepsValues = z.infer<typeof reorderRouteStepsSchema>;
export type CreateProductionRunValues = z.infer<typeof createProductionRunSchema>;
export type CancelProductionRunValues = z.infer<typeof cancelProductionRunSchema>;
export type CreateMachineCapabilityValues = z.infer<typeof createMachineCapabilitySchema>;
