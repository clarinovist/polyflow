import { z } from 'zod';

export const maintenanceSparePartSchema = z.object({
  productVariantId: z.string().min(1).optional(),
  sourceLocationId: z.string().min(1).optional(),
  name: z.string().min(1, 'Nama spare part wajib diisi').max(200),
  spec: z.string().max(300).optional(),
  quantity: z.coerce.number().positive('Jumlah harus positif'),
  note: z.string().max(300).optional(),
});

export const createMaintenanceRequestSchema = z.object({
  machineId: z.string().min(1, 'Mesin wajib dipilih'),
  complaint: z.string().min(5, 'Keluhan minimal 5 karakter').max(2000),
  urgency: z.enum(['LOW', 'NORMAL', 'URGENT']).default('NORMAL'),
  machineStopped: z.boolean().optional().default(false),
  clientRequestId: z.string().uuid(),
  spareParts: z.array(maintenanceSparePartSchema).max(30).default([]),
});

export type CreateMaintenanceRequestValues = z.infer<typeof createMaintenanceRequestSchema>;
