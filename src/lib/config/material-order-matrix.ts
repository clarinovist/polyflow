/** Matrix Material Order generik (data peran, tanpa nama orang/tenant hardcoded).
 *  Alur: PPIC/Produksi (pembuat) submit -> ADMIN/Kepala Pabrik approve -> Owner (SuperAdmin/Admin) FYI.
 *  Berlaku semua tenant dan divisi memakai peran yang sama.
 */
export const MATERIAL_ORDER_FLOW = {
  creatorHint: 'PPIC / Produksi',
  approverHint: 'Kepala Pabrik / Admin',
  fyiHint: 'Owner (FYI, tidak perlu tindakan)',
  warehouseHint: 'Gudang memproses order APPROVED',
} as const;
