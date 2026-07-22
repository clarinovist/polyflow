/** Warehouse component labels */
export const warehouseComponentLabels = {
  // Inventory Insights Panel
  transferStock: 'Transfer Stok',
  adjustStock: 'Penyesuaian Stok',
  stockOpname: 'Stock Opname',
  stockAging: 'Aging Stok',
  historyLogs: 'Log Riwayat',

  // Adjustment Form
  adjustmentTitle: 'Penyesuaian Stok',
  adjustmentDesc: 'Sesuaikan jumlah stok untuk produk di lokasi tertentu.',
  selectProduct: 'Pilih produk',
  selectLocation: 'Pilih lokasi',
  adjustmentType: 'Tipe Penyesuaian',
  addition: 'Penambahan',
  reduction: 'Pengurangan',
  reason: 'Alasan',
  reasonPlaceholder: 'contoh: Rusak, Expired, Ditemukan',
  quantity: 'Jumlah',
  confirmAdjustment: 'Konfirmasi Penyesuaian',

  // Bulk Adjust
  bulkAdjustTitle: 'Penyesuaian Stok Massal',
  bulkAdjustDesc: 'Sesuaikan stok untuk beberapa produk sekaligus.',
  addProduct: 'Tambah Produk',
  eGDamage: 'contoh: Rusak, Expired, Ditemukan',

  // Bulk Transfer
  bulkTransferTitle: 'Transfer Stok Massal',
  bulkTransferDesc: 'Transfer beberapa produk ke lokasi tujuan.',
  selectDestination: 'Pilih tujuan...',
  eGShipment: 'contoh: Pengiriman #123',
  destinationLocation: 'Lokasi Tujuan',
  sourceLocation: 'Lokasi Sumber',

  // Transfer Form
  transferTitle: 'Transfer Stok',
  transferDesc: 'Pindahkan produk dari satu lokasi ke lokasi lain.',
  fromLocation: 'Dari Lokasi',
  toLocation: 'Ke Lokasi',
  selectFromLocation: 'Pilih lokasi asal',
  selectToLocation: 'Pilih lokasi tujuan',
  transferQuantity: 'Jumlah Transfer',
  confirmTransfer: 'Konfirmasi Transfer',

  // Stock Aging
  stockAgingTitle: 'Aging Stok',
  stockAgingDesc: 'Analisa usia stok berdasarkan tanggal penerimaan batch.',

  // Quick Stock Check
  quickStockCheck: 'Cek Stok Cepat',
  searchSku: 'Cari SKU...',

  // Inventory Table
  inventoryTable: 'Tabel Inventaris',
  filterType: 'Filter tipe',
  allTypes: 'Semua Tipe',
  rawMaterial: 'Bahan Baku',
  finishedGood: 'Barang Jadi',
  wip: 'WIP',
  scrap: 'Scrap',
  inter: 'Intermediate',
  pack: 'Packaging',
  service: 'Service',

  // Table Headers
  product: 'Produk',
  location: 'Lokasi',
  stock: 'Stok',
  reserved: 'Terpesan',
  available: 'Tersedia',
  status: 'Status',
  inStock: 'Tersedia',
  unitCost: 'Harga Satuan',
  stockValue: 'Nilai Stok',

  // Selection
  selected: 'dipilih',
  selectAll: 'Pilih semua',
  bulkActions: 'Aksi massal',
  exportSelected: 'Export yang dipilih',
  waiting: 'Menunggu',
  customerOwned: 'Milik customer',

  // Search
  searchProduct: 'Cari produk / SKU...',

  // Inventory Analytics Card
  totalValue: 'Nilai Total',
  totalItems: 'Total Item',
  lowStock: 'Stok Rendah',
  outOfStock: 'Habis',

  // Inventory Desktop/Mobile
  noInventoryData: 'Tidak ada data inventaris.',

  // History Date Filter
  dateRange: 'Rentang Tanggal',
  startDate: 'Tanggal Mulai',
  endDate: 'Tanggal Akhir',

  // Import Stock
  importStock: 'Impor Stok',
  importStockDesc: 'Impor data stok dari file CSV/Excel.',
  uploadFile: 'Unggah File',
  downloadTemplate: 'Unduh Template',
  previewData: 'Preview Data',
  confirmImport: 'Konfirmasi Impor',

  // Import Stock Preview
  importPreview: 'Preview Impor',
  rowsImported: 'baris akan diimpor',
  rowsSkipped: 'baris dilewati',

  // Recent Transfers
  recentTransfers: 'Transfer Terbaru',
  noTransfers: 'Belum ada transfer.',

  // Stock History Chart
  stockHistory: 'Riwayat Stok',
  stockHistoryDesc: 'Tren pergerakan stok dari waktu ke waktu.',

  // Stock Movement Trends
  stockMovementTrends: 'Tren Pergerakan Stok',
  stockMovementDesc: 'Analisa arus masuk dan keluar stok.',

  // Threshold Dialog
  thresholdSettings: 'Pengaturan Threshold',
  lowStockThreshold: 'Threshold Stok Rendah',
  eG50: 'contoh: 50',

  // Warehouse Navigator
  warehouseNavigator: 'Navigasi Gudang',
  selectWarehouse: 'Pilih gudang',

  // Opname
  createOpname: 'Buat Stock Opname',
  createOpnameDesc: 'Buat sesi stock opname baru untuk audit fisik.',
  selectWarehouseOpname: 'Pilih gudang...',
  eGEndOfMonth: 'contoh: Audit Akhir Bulan ~ Jan 2026',
  opnameSession: 'Sesi Opname',
  opnameDetail: 'Detail Opname',
  opnameCounter: 'Counter Opname',
  opnameVariance: 'Variance Opname',
  expectedQty: 'Jumlah Harusnya',
  actualQty: 'Jumlah Aktual',
  variance: 'Variance',
  count: 'Hitung',
  optional: 'Opsional...',
  saveCount: 'Simpan Hitungan',
  finalizeOpname: 'Finalisasi Opname',
  markComplete: 'Tandai Selesai',
  submitVariance: 'Kirim Variance',

  // Batch Selector
  batchSelector: 'Pilih Batch',
  selectBatch: 'Pilih batch...',
  availableStock: 'Stok Tersedia',

  // Common
  save: 'Simpan',
  cancel: 'Batal',
  delete: 'Hapus',
  edit: 'Edit',
  create: 'Buat',
  search: 'Cari',
  filter: 'Filter',
  refresh: 'Segarkan',
  close: 'Tutup',
  back: 'Kembali',
  actions: 'Aksi',
  loading: 'Memuat...',
  noData: 'Tidak ada data',
} as const;
