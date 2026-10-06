import { z } from 'zod';

export const sparePartStockInSchema = z.object({
  locationId: z.string().min(1, 'Lokasi wajib dipilih'),
  productVariantId: z.string().min(1, 'Spare part wajib dipilih'),
  quantity: z.coerce.number().positive('Jumlah harus positif'),
  unitCost: z.coerce.number().nonnegative('Harga satuan tidak boleh negatif'),
  note: z.string().max(500).optional(),
  clientRequestId: z.string().uuid(),
});

export type SparePartStockInValues = z.infer<typeof sparePartStockInSchema>;
