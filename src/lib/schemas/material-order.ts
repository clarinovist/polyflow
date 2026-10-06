import { z } from 'zod';

export const materialOrderItemSchema = z.object({
  productVariantId: z.string().min(1, 'Material wajib diisi'),
  quantity: z.coerce.number().positive('Jumlah harus positif'),
  zakQuantity: z.coerce.number().positive().optional(),
  note: z.string().max(200).optional(),
});

export const createMaterialOrderSchema = z.object({
  orderType: z.string().min(1).max(20).default('HD'),
  bomId: z.string().min(1).optional(),
  outputVariantId: z.string().min(1).optional(),
  plannedQuantity: z.coerce.number().positive().optional(),
  notes: z.string().max(1000).optional(),
  clientRequestId: z.string().uuid(),
  items: z.array(materialOrderItemSchema).min(1, 'Minimal 1 item'),
});

export type CreateMaterialOrderValues = z.infer<typeof createMaterialOrderSchema>;
export type MaterialOrderItemValues = z.infer<typeof materialOrderItemSchema>;
