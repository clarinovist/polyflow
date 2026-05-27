/** Common status — dipakai di semua domain */
export const commonStatusLabels = {
  DRAFT: 'Draft',
  OPEN: 'Open',
  PENDING: 'Menunggu',
  CONFIRMED: 'Terkonfirmasi',
  IN_PROGRESS: 'Berjalan',
  COMPLETED: 'Selesai',
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
  CANCELLED: 'Dibatalkan',
  CLOSED: 'Ditutup',
  RELEASED: 'Dirilis',
  POSTED: 'Diposting',
  VOID: 'Void',
} as const;

export const productionStatusLabels = {
  DRAFT: 'Draft',
  OPEN: 'Open',
  PENDING: 'Menunggu',
  CONFIRMED: 'Terkonfirmasi',
  RELEASED: 'Siap Produksi',
  IN_PROGRESS: 'Sedang Diproduksi',
  COMPLETED: 'Produksi Selesai',
  CANCELLED: 'Dibatalkan',
} as const;

export const warehouseStatusLabels = {
  DRAFT: 'Draft',
  OPEN: 'Aktif',
  PENDING: 'Menunggu',
  IN_PROGRESS: 'Sedang Diproses',
  COMPLETED: 'Selesai',
  CANCELLED: 'Dibatalkan',
} as const;

export const salesStatusLabels = {
  DRAFT: 'Draft',
  CONFIRMED: 'Terkonfirmasi',
  IN_PRODUCTION: 'Dalam Produksi',
  READY_TO_SHIP: 'Siap Kirim',
  SHIPPED: 'Dikirim',
  DELIVERED: 'Terkirim',
  PARTIALLY_SHIPPED: 'Dikirim Sebagian',
  INVOICED: 'Tertagih',
  PAID: 'Lunas',
  CANCELLED: 'Dibatalkan',
} as const;

export const financeStatusLabels = {
  DRAFT: 'Draft',
  OPEN: 'Open',
  PENDING: 'Menunggu',
  POSTED: 'Diposting',
  VOID: 'Void / Dibatalkan',
  UNPAID: 'Belum Dibayar',
  PARTIALLY_PAID: 'Dibayar Sebagian',
  PAID: 'Lunas',
  OVERDUE: 'Lewat Jatuh Tempo',
  CANCELLED: 'Dibatalkan',
} as const;
