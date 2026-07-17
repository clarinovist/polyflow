/** Gudang / Warehouse */
export const warehouseLabels = {
  warehouse: 'Gudang',
  inventory: 'Stok',
  stock: 'Stok',
  stockMovement: 'Mutasi Stok',
  transferStock: 'Transfer Stok',
  stockAdjustment: 'Penyesuaian Stok',
  stockOpname: 'Stock Opname',
  goodsReceipt: 'Penerimaan Barang',
  incoming: 'Barang Masuk',
  outgoing: 'Antrian Kirim (SO)',
  sourceLocation: 'Lokasi Asal',
  destinationLocation: 'Lokasi Tujuan',
  availableStock: 'Stok Tersedia',
  reservedStock: 'Stok Terpesan',
  lowStock: 'Stok Menipis',

  // Dual-path material ownership (Path A = gudang RM/FG)
  pathATitle: 'Jalur Gudang (bahan baku & barang jadi)',
  pathAHelp:
    'Gudang mengeluarkan RM ke Mixing, catat pelembab/additive ad-hoc dari gudang RM, serta kelola FG & kirim. Pergerakan WIP antar mesin (Mixing→Extru→Packing) dikerjakan produksi di lantai, bukan pengajuan gudang RM.',
  warehouseActions: 'Aksi gudang',
  openActiveSpkQueue: 'Antrean SPK aktif',
} as const;
