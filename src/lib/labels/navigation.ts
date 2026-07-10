/** Main sidebar navigation */
export const mainNavLabels = {
  sales: "Penjualan",
  purchasing: "Pembelian",
  production: "Produksi",
  inventory: "Stok",
  accounting: "Finance",

  // Master data
  productCatalog: "Katalog Produk",
  boms: "BOM / Formula",
  machines: "Mesin",
  employees: "Karyawan",

  // Maklon
  maklonReceipts: "Penerimaan Maklon",
  maklonReturns: "Retur Maklon",

  // Support
  help: "Bantuan",
} as const;

/** Sidebar by domain */
export const productionSidebarLabels = {
  overview: "Overview",
  // Production Planning
  workOrders: "SPK Produksi",
  bom: "BOM / Formula",
  incomingRequests: "Permintaan Masuk",
  productionSchedule: "Jadwal Produksi",
  materialRequirements: "Kebutuhan Material",
  productionAnalytics: "Analitik Produksi",
  // Production Floor
  dailyProduction: "Produksi Aktif",
  machineBoard: "Papan Mesin",
  floorStock: "Stok Lantai",
  teamShifts: "Tim / Shift",
  outputLogs: "Log Hasil",
  packingMonthlyReport: "Laporan Packing",
  workShifts: "Shift Kerja",
  operatorKiosk: "Kiosk Operator",
  costingDashboard: "Costing Dashboard",
} as const;

export const warehouseSidebarLabels = {
  jobQueue: "Antrian Tugas",
  incomingReceipts: "Penerimaan Barang",
  outgoingOrders: "Barang Keluar",
  stockOpname: "Stock Opname",
  stockOverview: "Ikhtisar Stok",
  stockTransfer: "Transfer Stok",
  stockAdjustment: "Penyesuaian Stok",
  locations: "Lokasi",
  analyticsDashboard: "Dashboard Analitik",
  stockAging: "Aging Stok",
  stockMovement: "Mutasi Stok",
  transferAnalytics: "Analitik Transfer",
  adjustmentAnalytics: "Analitik Penyesuaian",
} as const;

export const financeSidebarLabels = {
  dashboard: "Dashboard",
  pettyCash: "Petty Cash",
  pettyCashDailyReport: "Laporan Harian",
  pettyCashCashOpname: "Cash Opname",
  pettyCashRekap: "Rekap Kas",
  bankReconciliation: "Rekonsiliasi Bank",
  fixedAssets: "Aset Tetap",
  budgetPlanning: "Perencanaan Anggaran",
  budgeting: "Anggaran vs Aktual",
  budgetInput: "Input Anggaran",
  aging: "Aging AR/AP",
  fohAllocation: "Alokasi Biaya Pabrik",
  costingDashboard: "Costing Dashboard",
  hppReport: "Laporan HPP",
  quickEntry: "Quick Entry",
  receivables: "Piutang",
  customerPayments: "Pembayaran Customer",
  payables: "Utang",
  supplierPayments: "Pembayaran Supplier",
  journalEntries: "Jurnal",
  balanceSheet: "Neraca",
  incomeStatement: "Laba Rugi",
  cashFlowStatement: "Arus Kas",
  trialBalance: "Neraca Saldo",
  budgetVariance: "Varians Anggaran",
  taxReport: "Laporan Pajak",
  maklonProfitability: "Profitabilitas Maklon",
  generalLedger: "Buku Besar",
  chartOfAccounts: "Bagan Akun",
  fiscalPeriods: "Periode Fiskal",
  openingBalance: "Saldo Awal",
} as const;

export const salesSidebarLabels = {
  salesDashboard: "Dashboard Penjualan",
  quotations: "Penawaran",
  salesOrders: "Sales Order",
  mtsUnpaid: "MTS Belum Lunas",
  salesInvoices: "Invoice Penjualan",
  deliveryTracking: "Surat Jalan",
  deliverySchedules: "Jadwal Kirim",
  vehicles: "Armada",
  shippingCostReport: "Biaya Pengiriman",
  salesReturns: "Retur Penjualan",
  customerManagement: "Customer",
} as const;

export const planningSidebarLabelsExtended = {
  planningDashboard: "Dashboard Planning",
  workOrders: "SPK Produksi",
  incomingRequests: "Permintaan Masuk",
  productionSchedule: "Jadwal Produksi",
  materialRequirements: "Kebutuhan Material",
  productionAnalytics: "Analitik Produksi",
} as const;

export const purchasingSidebarLabels = {
  purchasingDashboard: "Dashboard Pembelian",
  purchaseRequests: "Permintaan Pembelian",
  purchaseOrders: "Order Pembelian",
  purchaseReturns: "Retur Pembelian",
  supplierManagement: "Supplier",
  procurementAnalytics: "Analitik Pembelian",
} as const;
