/** Dashboard labels — role-aware command home */
export const dashboardLabels = {
  // Header
  commandHome: 'Beranda Kerja',
  commandHomeSubtitle: 'Prioritas hari ini dan pintasan sesuai peran Anda.',
  executiveOverview: 'Ringkasan Eksekutif',
  realtimeInsight: 'Insight produksi dan keuangan real-time.',

  // Attention
  needsAttentionTitle: 'Perlu Perhatian',
  needsAttentionEmpty: 'Tidak ada item mendesak — bagus.',
  openItem: 'Buka',

  // Sections
  moduleShortcuts: 'Pintasan Modul',
  quickActions: 'Aksi Cepat',
  revenueTrend: 'Tren Pendapatan Tahunan',
  cashflowSnapshot: 'Snapshot Kas',

  // KPI Cards (shared keys)
  revenueMTD: 'Pendapatan (MTD)',
  spendingMTD: 'Pengeluaran (MTD)',
  machineUtilization: 'Utilisasi Mesin',
  inventoryValue: 'Nilai Stok',

  // KPI subtitles
  activeOrders: 'pesanan aktif',
  pendingPOs: 'PO tertunda',
  running: 'berjalan',
  lowStockAlerts: 'peringatan stok rendah',

  // KPI trends
  vsLastMonth: 'vs bulan lalu',
  stableCapacity: 'Kapasitas stabil',
  needsAttention: 'Perlu Perhatian',
  healthyLevels: 'Level aman',

  // Summary cards (legacy keys kept for compatibility)
  salesPerformance: 'Performa Penjualan',
  procurement: 'Pembelian',
  manufacturing: 'Produksi',
  inventoryHealth: 'Kondisi Stok',

  // Metric labels
  activeOrdersLabel: 'Pesanan Aktif',
  pendingInvoices: 'Invoice Tertunda',
  pendingPOsLabel: 'PO Tertunda',
  spendingLabel: 'Pengeluaran (MTD)',
  yieldRate: 'Yield Rate',
  totalScrap: 'Total Scrap',
  downtime: 'Downtime',
  totalItems: 'Total Item',
  lowStockAlertsLabel: 'Peringatan Stok Rendah',
  overdueReceivables: 'Piutang Overdue',
  overduePayables: 'Hutang Overdue',
  dueThisWeek: 'Jatuh Tempo Minggu Ini',

  // Links
  viewAnalytics: 'Lihat Analitik',
  viewAll: 'Lihat semua',

  // Quick actions (legacy + shared)
  logDowntime: 'Catat Downtime',
  recordScrap: 'Catat Scrap',
  newProductionOrder: 'SPK Baru',
  addNewProduct: 'Tambah Produk',

  // Ops portal CTA
  yourWorkspace: 'Workspace Anda',

  // Misc
  refresh: 'Segarkan',
  refreshDashboard: 'Segarkan data dashboard',
  loadFailed: 'Gagal memuat statistik dashboard',
  tryAgain: 'Coba Lagi',
} as const;
