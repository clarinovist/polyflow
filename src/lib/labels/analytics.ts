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
    machineEfficiencyDesc: 'Performa mesin per jam dan persen affal',
    unitsPerHour: 'Unit / Jam',
    scrapRate: '% Affal',
    productionRealization: 'Realisasi Produksi (Yield)',
    productionRealizationTable: 'Realisasi Produksi',
    productionRealizationDesc: 'Perbandingan rencana vs aktual per SPK',
    planned: 'Rencana',
    actual: 'Aktual',

    // Material
    materialUsageVariance: 'Varians Penggunaan Material',
    materialUsageVarianceDesc:
        'Perbandingan penggunaan material aktual vs standar',
    scrapAnalysis: 'Analisa Affal',
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
    topScrapReasons: 'Alasan Affal Material Teratas',

    // Operator
    operatorComparison: 'Kinerja Operator per Proses',
    operatorComparisonDesc:
        'Dibandingkan dalam proses yang sama. Satuan mengikuti output tiap proses; tidak dijumlahkan atau diperingkat antar proses.',
    operatorComparisonEmpty: 'Belum ada hasil operator pada periode ini.',

    // Date Range
    selectDateRange: 'Pilih rentang tanggal',
    last7Days: '7 Hari Terakhir',
    last30Days: '30 Hari Terakhir',
    custom: 'Kustom',
} as const;
