/** Main sidebar navigation */
export const mainNavLabels = {
  sales: 'Penjualan',
  planning: 'Planning',
  production: 'Produksi',
  inventory: 'Stok',
  accounting: 'Finance',

  // Master data
  productCatalog: 'Katalog Produk',
  boms: 'BOM / Formula',
  machines: 'Mesin',
  employees: 'Karyawan',

  // Maklon
  maklonReceipts: 'Penerimaan Maklon',
  maklonReturns: 'Retur Maklon',
} as const;

/** Sidebar by domain */
export const productionSidebarLabels = {
  overview: 'Overview',
  machineBoard: 'Papan Mesin',
  floorStock: 'Stok Lantai',
  teamShifts: 'Tim / Shift',
  outputLogs: 'Log Hasil',
  productionCosting: 'Costing Produksi',
  workShifts: 'Shift Kerja',
  operatorKiosk: 'Kiosk Operator',
} as const;

export const warehouseSidebarLabels = {
  jobQueue: 'Antrian Tugas',
  incomingReceipts: 'Penerimaan Barang',
  outgoingOrders: 'Barang Keluar',
  stockOverview: 'Ikhtisar Stok',
  stockOpname: 'Stock Opname',
  stockTransfer: 'Transfer Stok',
  stockAdjustment: 'Penyesuaian Stok',
  stockAging: 'Aging Stok',
  historyLogs: 'Log Riwayat',
  locations: 'Lokasi',
} as const;

export const financeSidebarLabels = {
  dashboard: 'Dashboard',
  pettyCash: 'Petty Cash',
  bankReconciliation: 'Rekonsiliasi Bank',
  fixedAssets: 'Aset Tetap',
  budgeting: 'Anggaran vs Aktual',
  aging: 'Aging AR/AP',
  fohAllocation: 'Alokasi FOH',
  costingDashboard: 'Costing Dashboard',
  materialSimulator: 'Simulator Material',
  hppCalculator: 'Kalkulator HPP',
  quickEntry: 'Quick Entry',
  receivables: 'Piutang',
  mtsUnpaid: 'MTS Belum Lunas',
  customerPayments: 'Pembayaran Customer',
  payables: 'Utang',
  supplierPayments: 'Pembayaran Supplier',
  journalEntries: 'Jurnal',
  balanceSheet: 'Neraca',
  incomeStatement: 'Laba Rugi',
  cashFlowStatement: 'Arus Kas',
  trialBalance: 'Neraca Saldo',
  budgetVariance: 'Varians Anggaran',
  taxReport: 'Laporan Pajak',
  maklonProfitability: 'Profitabilitas Maklon',
  chartOfAccounts: 'Bagan Akun',
  fiscalPeriods: 'Periode Fiskal',
  openingBalance: 'Saldo Awal',
} as const;

export const salesSidebarLabels = {
  salesDashboard: 'Dashboard Penjualan',
  quotations: 'Penawaran',
  salesOrders: 'Sales Order',
  mtsUnpaid: 'MTS Belum Lunas',
  salesInvoices: 'Invoice Penjualan',
  deliveryTracking: 'Surat Jalan',
  salesReturns: 'Retur Penjualan',
  customerManagement: 'Customer',
} as const;

export const planningSidebarLabelsExtended = {
  planningDashboard: 'Dashboard Planning',
  workOrders: 'SPK Produksi',
  incomingRequests: 'Permintaan Masuk',
  productionSchedule: 'Jadwal Produksi',
  materialRequirements: 'Kebutuhan Material',
  purchaseRequests: 'Permintaan Pembelian',
  purchaseOrders: 'Purchase Order',
  purchaseReturns: 'Retur Pembelian',
  supplierManagement: 'Supplier',
  productionAnalytics: 'Analitik Produksi',
  procurementAnalytics: 'Analitik Procurement',
} as const;
