/** Analytics component labels */
export const analyticsLabels = {
  // Common
  selectPeriod: 'Pilih periode',
  today: 'Hari Ini',
  yesterday: 'Kemarin',
  thisMonth: 'Bulan Ini',
  lastMonth: 'Bulan Lalu',
  noData: 'Tidak ada data',

  // Sales
  salesPipeline: 'Pipeline Penjualan',
  salesPipelineDesc: 'Nilai pesanan berdasarkan status',
  revenueAwareness: 'Awareness Pendapatan',
  revenueTracking: 'Pelacakan pendapatan penjualan dari waktu ke waktu',
  topProducts: 'Produk Teratas',
  topProductsDesc: 'Berdasarkan pendapatan bulan ini',
  topSuppliers: 'Supplier Teratas',
  topSuppliersDesc: 'Berdasarkan pengeluaran periode ini',

  // Finance
  apAging: 'Aging Hutang',
  apAgingDesc: 'Invoice belum bayar berdasarkan usia',
  arAging: 'Aging Piutang',
  arAgingDesc: 'Invoice belum bayar berdasarkan usia',

  // Production
  machineEfficiency: 'Efisiensi Mesin',
  machineEfficiencyDesc: 'Performa mesin per jam dan tingkat scrap',
  unitsPerHour: 'Unit / Jam',
  scrapRate: 'Tingkat Scrap %',
  productionRealization: 'Realisasi Produksi (Yield)',
  productionRealizationTable: 'Realisasi Produksi',
  productionRealizationDesc: 'Perbandingan rencana vs aktual per SPK',
  planned: 'Rencana',
  actual: 'Aktual',

  // Material
  materialUsageVariance: 'Varians Penggunaan Material',
  materialUsageVarianceDesc: 'Perbandingan penggunaan material aktual vs standar',
  scrapAnalysis: 'Analisa Scrap',
  qty: 'Jumlah',

  // Purchase
  spendingTrend: 'Tren Pengeluaran',
  spendingTrendDesc: 'Tren pengeluaran procurement bulanan',
  purchaseOrderStatus: 'Status Purchase Order',
  purchaseOrderStatusDesc: 'Distribusi nilai berdasarkan status',

  // Quality
  inspectionDistribution: 'Distribusi Inspeksi',
  inspectionDesc: 'Rincian hasil inspeksi',
  noInspectionData: 'Tidak ada data inspeksi',
  topScrapReasons: 'Alasan Scrap Material Teratas',

  // Operator
  operatorLeaderboard: 'Leaderboard Operator',
  operatorLeaderboardDesc: 'Metrik produktivitas detail untuk semua operator.',

  // Date Range
  selectDateRange: 'Pilih rentang tanggal',
  last7Days: '7 Hari Terakhir',
  last30Days: '30 Hari Terakhir',
  custom: 'Kustom',
} as const;
