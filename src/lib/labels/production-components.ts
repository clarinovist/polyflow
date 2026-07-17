/** Production components labels */
export const productionComponentLabels = {
  // Forms — common
  selectType: 'Pilih tipe',
  selectLocation: 'Pilih lokasi',
  selectStatus: 'Pilih status',
  generating: 'Generating...',
  searchRole: 'Cari role...',
  eGExample: 'contoh',

  // Machine Form
  machineCode: 'Kode Mesin',
  machineName: 'Nama Mesin',
  machineType: 'Tipe Mesin',
  machineLocation: 'Lokasi Mesin',
  machineStatus: 'Status Mesin',
  machineCapacity: 'Kapasitas Mesin',
  selectMachineType: 'Pilih tipe mesin',
  selectMachineLocation: 'Pilih lokasi mesin',
  selectMachineStatus: 'Pilih status mesin',

  // Employee Form
  employeeName: 'Nama Karyawan',
  employeeRole: 'Role Karyawan',
  employeeNik: 'NIK',
  employeePhone: 'Telepon',
  employeeSalary: 'Gaji',
  selectStandardShift: 'Pilih Shift Standar',
  selectMachineUpdatesOrder: 'Pilih Mesin (Update Pesanan)',
  selectOperator: 'Pilih Operator',

  // Shift Manager
  shiftManagement: 'Manajemen Shift',
  shiftSchedule: 'Jadwal Shift',
  assignShift: 'Tugaskan Shift',
  activeShift: 'Shift Aktif',

  // BOM
  bomName: 'Nama BOM',
  bomDescription: 'Deskripsi BOM',
  outputProduct: 'Produk Hasil',
  outputQuantity: 'Jumlah Hasil',
  bomStage: 'Stage BOM',
  selectProductToProduce: 'Pilih produk yang akan diproduksi',
  selectStage: 'Pilih Stage',
  materialList: 'Daftar Material',
  addMaterial: 'Tambah Material',
  searchMaterial: 'Cari material...',
  suggestedMaterials: 'Material yang disarankan...',
  bomRecipe: 'Resep BOM',

  // BOM Details
  bomDetails: 'Detail BOM',
  bomItems: 'Item BOM',
  inputMaterial: 'Material Masuk',
  quantityRequired: 'Jumlah Dibutuhkan',
  unit: 'Satuan',

  // Production Requests
  productionRequests: 'Permintaan Produksi',
  incomingRequests: 'Permintaan Masuk',
  noRequests: 'Tidak ada permintaan produksi',
  processRequest: 'Proses Permintaan',
  createWorkOrder: 'Buat SPK',

  // Order Detail
  orderDetail: 'Detail Pesanan',
  addOutput: 'Tambah Output',
  recordScrap: 'Catat Scrap',
  recordQC: 'Catat QC',
  addIssue: 'Tambah Issue',
  batchIssue: 'Issue Batch',
  manualProcurement: 'Procurement Manual',
  deleteScrap: 'Hapus Scrap',
  voidExecution: 'Batalkan Eksekusi',
  childOrders: 'Pesanan Anak',
  selectItem: 'Pilih Item',
  issueReason: 'Alasan Issue',
  quantity: 'Jumlah',

  // Dispatch
  reassignMachine: 'Tugaskan Ulang Mesin',
  rescheduleOrder: 'Jadwalkan Ulang Pesanan',
  chooseMachine: 'Pilih mesin',
  newDate: 'Tanggal Baru',

  // Glossary
  workOrderGuide: 'Panduan SPK',
  overview: 'Ikhtisar',
  statusFlow: 'Alur Status',
  processes: 'Proses',
  quality: 'Kualitas',
  orderNumber: 'Nomor Pesanan',
  orderNumberDesc: 'Identifier unik untuk setiap SPK (auto-generated atau manual)',
  bomFormula: 'BOM / Formula',
  bomFormulaDesc: 'Resep produksi yang mendefinisikan apa yang diproduksi dan material yang dibutuhkan',

  // Record Scrap Dialog
  scrapDetails: 'Detail Scrap',
  itemScrapped: 'Item Discrap',
  confirmScrapRecord: 'Konfirmasi Catatan Scrap',
  machineSetupPlaceholder: 'contoh: Setup mesin',

  // Record QC Dialog
  addInspection: 'Tambah Inspeksi',
  qualityInspection: 'Inspeksi Kualitas',
  qcAssessment: 'Penilaian QC',
  result: 'Hasil',
  notes: 'Catatan',
  inspectionCommentsPlaceholder: 'Komentar inspeksi...',
  saveResult: 'Simpan Hasil',

  // Batch Issue Material Dialog
  transferMaterial: 'Transfer Material',
  issueMaterial: 'Terbitkan Material',
  transferMaterialsToStaging: 'Transfer Material ke Staging/Produksi',
  issueMaterialsAndUpdatePlan: 'Terbitkan Material & Perbarui Rencana',
  sourceLocation: 'Lokasi Sumber',
  materialHeader: 'Material',
  qtyToTransfer: 'Jumlah Transfer',
  qtyToIssue: 'Jumlah Diterbitkan',
  planned: 'Direncanakan',
  substitute: 'Pengganti',
  selectSubstitute: 'Pilih pengganti...',
  overrideSourceLocation: 'Ganti Lokasi Sumber',
  defaultLocation: 'Lokasi Default',
  stock: 'Stok',
  fixShortage: 'Atasi Kekurangan',
  addSubstituteMaterial: 'Tambah Material Pengganti',
  quickStockAdjustment: 'Penyesuaian Stok Cepat',
  refreshStock: 'Segarkan Stok',
  editingRowsWarning: 'Mengedit baris akan memperbarui Rencana Pesanan secara permanen.',
  undoDelete: 'Urungkan Hapus',
  removeRequirement: 'Hapus Kebutuhan',
  warningTargetWarehouse: 'Peringatan: Target kemungkinan Gudang. Pastikan Pesanan ini diatur ke Lokasi Produksi.',

  // Ad-Hoc Material Usage Dialog (Path A — ideally from Warehouse)
  recordAdHocUsage: 'Catat Pemakaian Bahan',
  adHocUsageHelp:
    'Untuk bahan dari gudang RM (mis. pelembab). Stok langsung berkurang & masuk HPP WO. Idealnya dicatat oleh gudang di modul Warehouse.',
  adHocMaterial: 'Bahan Ad-Hoc',
  selectAdHocMaterial: 'Pilih bahan...',
  adHocReason: 'Alasan (opsional)',
  adHocReasonPlaceholder: 'contoh: pelembab tambahan saat produksi',
  recording: 'Mencatat...',
  nonPlanBlockedInExtrusi:
    'Bahan di luar plan (biasanya dari gudang RM): gunakan Catat Pemakaian Bahan di modul Gudang agar stok & HPP langsung benar. Jangan transfer staging seperti Mixing HD.',

  // Dual-path ownership callouts on production Materials tab
  materialPathFloorTitle: 'Jalur lantai (WIP)',
  materialPathFloorHelp:
    'Compound/roll antar proses dikelola produksi. Transfer Material di sini untuk staging Mixing→Extru/Packing. Tidak perlu pengajuan gudang RM per stage.',
  materialPathWarehouseTitle: 'Jalur gudang (bahan baku)',
  materialPathWarehouseHelp:
    'Resin, pelembab, dan bahan dari gudang RM dikeluarkan oleh gudang di modul Warehouse. Produksi melihat kebutuhan di sini; pengiriman RM lewat antrean gudang.',
  openWarehouseForRm: 'Buka modul Gudang (kirim RM / pelembab)',
  materialPathAdHocHint:
    'Pelembab atau additive dari gudang RM: catat di Gudang → Catat Pemakaian Bahan (bukan transfer WIP).',

  // Manual Procurement Dialog
  procureMaterials: 'Pengadaan Material',
  selectMaterialsDescription: 'Pilih material dari SPK ini untuk membuat Permintaan Pembelian.',
  select: 'Pilih',
  plannedHeader: 'Rencana',
  qtyToProcure: 'Jumlah Diadaan',
  priority: 'Prioritas',
  normal: 'Normal',
  urgent: 'Mendesak',
  additionalNotes: 'Catatan tambahan untuk Pembelian...',
  purchaseRequestInfo: 'Ini akan membuat Permintaan Pembelian baru untuk tim Pembelian. Tidak akan membuat Pesanan Pembelian secara langsung.',
  creatingPR: 'Membuat PR...',
  createPurchaseRequest: 'Buat Permintaan Pembelian',

  // Child Order List
  workOrders: 'SPK',
  requiresProduction: 'Perlu Diproduksi',
  creating: 'Membuat...',
  activeWorkOrders: 'SPK Aktif',

  // Delete Scrap Button
  deleteScrapRecord: 'Hapus Catatan Scrap',

  // Acknowledge / Actions
  acknowledgeHandover: 'Konfirmasi Serah Terima',
  acknowledge: 'Konfirmasi',
  assignJob: 'Tugaskan Pekerjaan',
  reassign: 'Tugaskan Ulang',

  // Reassign Machine Button
  changeMachine: 'Ganti Mesin',
  assignMachine: 'Tugaskan Mesin',

  // Employee Actions
  editDetails: 'Edit Detail',

  // Machine Actions
  setActive: 'Aktifkan',
  setMaintenance: 'Atur Pemeliharaan',

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
} as const;
