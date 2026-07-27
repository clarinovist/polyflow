export interface FeatureDefinition {
    featureKey: string;
    moduleKey: string;
    label: string;
    pattern: RegExp;
    priority: number; // Higher number = checked first
}

export interface FeatureResolveResult {
    featureKey: string;
    moduleKey: string;
    label: string;
}

// Allowlist of feature definitions matching real Polyflow App Router structure
const FEATURE_REGISTRY: FeatureDefinition[] = [
    // ─── DASHBOARD MODULE ─────────────────────────
    {
        featureKey: 'dashboard.products',
        moduleKey: 'dashboard',
        label: 'Katalog Produk Master',
        pattern: /^\/dashboard\/products(?:\/.*)?$/,
        priority: 95,
    },
    {
        featureKey: 'dashboard.boms',
        moduleKey: 'dashboard',
        label: 'Master Bill of Materials',
        pattern: /^\/dashboard\/boms(?:\/.*)?$/,
        priority: 95,
    },
    {
        featureKey: 'dashboard.machines',
        moduleKey: 'dashboard',
        label: 'Master Mesin Produksi',
        pattern: /^\/dashboard\/machines(?:\/.*)?$/,
        priority: 95,
    },
    {
        featureKey: 'dashboard.employees',
        moduleKey: 'dashboard',
        label: 'Master Karyawan Dashboard',
        pattern: /^\/dashboard\/employees(?:\/.*)?$/,
        priority: 95,
    },
    {
        featureKey: 'dashboard.maklon',
        moduleKey: 'dashboard',
        label: 'Penerimaan & Retur Maklon',
        pattern: /^\/dashboard\/maklon(?:\/.*)?$/,
        priority: 95,
    },
    {
        featureKey: 'dashboard.settings',
        moduleKey: 'dashboard',
        label: 'Pengaturan Dashboard',
        pattern: /^\/dashboard\/settings(?:\/.*)?$/,
        priority: 95,
    },
    {
        featureKey: 'dashboard.overview',
        moduleKey: 'dashboard',
        label: 'Dashboard Utama',
        pattern: /^\/dashboard$/,
        priority: 80,
    },

    // ─── SALES MODULE ─────────────────────────
    {
        featureKey: 'sales.orders.detail',
        moduleKey: 'sales',
        label: 'Detail Sales Order',
        pattern: /^\/sales\/orders\/[^/]+$/,
        priority: 100,
    },
    {
        featureKey: 'sales.orders.list',
        moduleKey: 'sales',
        label: 'Daftar Sales Order',
        pattern: /^\/sales\/orders$/,
        priority: 90,
    },
    {
        featureKey: 'sales.quotations.detail',
        moduleKey: 'sales',
        label: 'Detail Penawaran Sales',
        pattern: /^\/sales\/quotations\/[^/]+$/,
        priority: 100,
    },
    {
        featureKey: 'sales.quotations.list',
        moduleKey: 'sales',
        label: 'Daftar Penawaran Sales',
        pattern: /^\/sales\/quotations$/,
        priority: 90,
    },
    {
        featureKey: 'sales.customers.detail',
        moduleKey: 'sales',
        label: 'Detail Pelanggan',
        pattern: /^\/sales\/customers\/[^/]+$/,
        priority: 100,
    },
    {
        featureKey: 'sales.customers.list',
        moduleKey: 'sales',
        label: 'Daftar Pelanggan',
        pattern: /^\/sales\/customers$/,
        priority: 90,
    },
    {
        featureKey: 'sales.deliveries.detail',
        moduleKey: 'sales',
        label: 'Detail Surat Jalan Sales',
        pattern: /^\/sales\/deliveries\/[^/]+$/,
        priority: 100,
    },
    {
        featureKey: 'sales.deliveries.list',
        moduleKey: 'sales',
        label: 'Pengiriman & Surat Jalan Sales',
        pattern: /^\/sales\/deliveries$/,
        priority: 90,
    },
    {
        featureKey: 'sales.returns.detail',
        moduleKey: 'sales',
        label: 'Detail Retur Penjualan',
        pattern: /^\/sales\/returns\/[^/]+$/,
        priority: 100,
    },
    {
        featureKey: 'sales.returns.list',
        moduleKey: 'sales',
        label: 'Daftar Retur Penjualan',
        pattern: /^\/sales\/returns$/,
        priority: 90,
    },
    {
        featureKey: 'sales.visits',
        moduleKey: 'sales',
        label: 'Kunjungan Sales',
        pattern: /^\/sales\/visits(?:\/.*)?$/,
        priority: 90,
    },
    {
        featureKey: 'sales.routes',
        moduleKey: 'sales',
        label: 'Rencana Rute Sales',
        pattern: /^\/sales\/routes(?:\/.*)?$/,
        priority: 90,
    },
    {
        featureKey: 'sales.delivery_schedules',
        moduleKey: 'sales',
        label: 'Jadwal Pengiriman Sales',
        pattern: /^\/sales\/delivery-schedules(?:\/.*)?$/,
        priority: 90,
    },
    {
        featureKey: 'sales.vehicles',
        moduleKey: 'sales',
        label: 'Armada & Kendaraan Sales',
        pattern: /^\/sales\/vehicles(?:\/.*)?$/,
        priority: 90,
    },
    {
        featureKey: 'sales.overview',
        moduleKey: 'sales',
        label: 'Ikhtisar Sales',
        pattern: /^\/sales$/,
        priority: 80,
    },

    // ─── PRODUCTION MODULE ─────────────────────────
    {
        featureKey: 'production.orders.detail',
        moduleKey: 'production',
        label: 'Detail SPK / Orders',
        pattern: /^\/production\/orders\/[^/]+$/,
        priority: 100,
    },
    {
        featureKey: 'production.orders.list',
        moduleKey: 'production',
        label: 'Daftar SPK / Orders',
        pattern: /^\/production\/orders$/,
        priority: 90,
    },
    {
        featureKey: 'production.boms.detail',
        moduleKey: 'production',
        label: 'Detail BOM (Formula)',
        pattern: /^\/production\/boms\/[^/]+$/,
        priority: 100,
    },
    {
        featureKey: 'production.boms.list',
        moduleKey: 'production',
        label: 'Daftar Bill of Materials',
        pattern: /^\/production\/boms$/,
        priority: 90,
    },
    {
        featureKey: 'production.daily',
        moduleKey: 'production',
        label: 'Laporan Harian Produksi',
        pattern: /^\/production\/daily(?:\/.*)?$/,
        priority: 90,
    },
    {
        featureKey: 'production.history',
        moduleKey: 'production',
        label: 'Riwayat Hasil Produksi',
        pattern: /^\/production\/history(?:\/.*)?$/,
        priority: 90,
    },
    {
        featureKey: 'production.machines',
        moduleKey: 'production',
        label: 'Status & Downtime Mesin',
        pattern: /^\/production\/machines(?:\/.*)?$/,
        priority: 90,
    },
    {
        featureKey: 'production.mrp',
        moduleKey: 'production',
        label: 'Kebutuhan Material (MRP)',
        pattern: /^\/production\/mrp(?:\/.*)?$/,
        priority: 90,
    },
    {
        featureKey: 'production.costing',
        moduleKey: 'production',
        label: 'HPP & Costing Produksi',
        pattern: /^\/production\/costing(?:\/.*)?$/,
        priority: 90,
    },
    {
        featureKey: 'production.schedule',
        moduleKey: 'production',
        label: 'Jadwal Produksi',
        pattern: /^\/production\/schedule(?:\/.*)?$/,
        priority: 90,
    },
    {
        featureKey: 'production.overview',
        moduleKey: 'production',
        label: 'Ikhtisar Produksi',
        pattern: /^\/production$/,
        priority: 80,
    },

    // ─── WAREHOUSE MODULE (Actual Routes) ─────────────────────────
    {
        featureKey: 'warehouse.inventory.detail',
        moduleKey: 'warehouse',
        label: 'Detail Stok Barang',
        pattern: /^\/warehouse\/inventory\/[^/]+$/,
        priority: 100,
    },
    {
        featureKey: 'warehouse.inventory.list',
        moduleKey: 'warehouse',
        label: 'Stok Barang & Material',
        pattern: /^\/warehouse\/inventory$/,
        priority: 90,
    },
    {
        featureKey: 'warehouse.incoming.detail',
        moduleKey: 'warehouse',
        label: 'Detail Barang Masuk (GR)',
        pattern: /^\/warehouse\/incoming\/[^/]+$/,
        priority: 100,
    },
    {
        featureKey: 'warehouse.incoming.list',
        moduleKey: 'warehouse',
        label: 'Penerimaan Barang Masuk',
        pattern: /^\/warehouse\/incoming$/,
        priority: 90,
    },
    {
        featureKey: 'warehouse.outgoing.detail',
        moduleKey: 'warehouse',
        label: 'Detail Surat Jalan / Outgoing',
        pattern: /^\/warehouse\/outgoing\/[^/]+$/,
        priority: 100,
    },
    {
        featureKey: 'warehouse.outgoing.list',
        moduleKey: 'warehouse',
        label: 'Pengeluaran Barang (Surat Jalan)',
        pattern: /^\/warehouse\/outgoing$/,
        priority: 90,
    },
    {
        featureKey: 'warehouse.opname.detail',
        moduleKey: 'warehouse',
        label: 'Detail Stock Opname',
        pattern: /^\/warehouse\/opname\/[^/]+$/,
        priority: 100,
    },
    {
        featureKey: 'warehouse.opname.list',
        moduleKey: 'warehouse',
        label: 'Stock Opname Gudang',
        pattern: /^\/warehouse\/opname$/,
        priority: 90,
    },
    {
        featureKey: 'warehouse.mobile.opname.detail',
        moduleKey: 'warehouse',
        label: 'Detail Stock Opname Mobile',
        pattern: /^\/warehouse\/mobile\/opname\/[^/]+$/,
        priority: 100,
    },
    {
        featureKey: 'warehouse.mobile.opname.list',
        moduleKey: 'warehouse',
        label: 'Daftar Stock Opname Mobile',
        pattern: /^\/warehouse\/mobile\/opname$/,
        priority: 90,
    },
    {
        featureKey: 'warehouse.materials',
        moduleKey: 'warehouse',
        label: 'Gudang Bahan Baku & Penolong',
        pattern: /^\/warehouse\/materials(?:\/.*)?$/,
        priority: 90,
    },
    {
        featureKey: 'warehouse.locations',
        moduleKey: 'warehouse',
        label: 'Master Lokasi & Sekat Gudang',
        pattern: /^\/warehouse\/locations(?:\/.*)?$/,
        priority: 90,
    },
    {
        featureKey: 'warehouse.analytics',
        moduleKey: 'warehouse',
        label: 'Analitik Gudang & Turnover',
        pattern: /^\/warehouse\/analytics(?:\/.*)?$/,
        priority: 90,
    },
    {
        featureKey: 'warehouse.mobile',
        moduleKey: 'warehouse',
        label: 'Mobile Warehouse Portal',
        pattern: /^\/warehouse\/mobile(?:\/.*)?$/,
        priority: 90,
    },
    {
        featureKey: 'warehouse.overview',
        moduleKey: 'warehouse',
        label: 'Ikhtisar Gudang',
        pattern: /^\/warehouse$/,
        priority: 80,
    },

    // ─── PURCHASING MODULE ─────────────────────────
    {
        featureKey: 'purchasing.orders.detail',
        moduleKey: 'purchasing',
        label: 'Detail Purchase Order',
        pattern: /^\/purchasing\/orders\/[^/]+$/,
        priority: 100,
    },
    {
        featureKey: 'purchasing.orders.list',
        moduleKey: 'purchasing',
        label: 'Daftar Purchase Order',
        pattern: /^\/purchasing\/orders$/,
        priority: 90,
    },
    {
        featureKey: 'purchasing.requests',
        moduleKey: 'purchasing',
        label: 'Permintaan Pembelian (PR)',
        pattern: /^\/purchasing\/requests(?:\/.*)?$/,
        priority: 90,
    },
    {
        featureKey: 'purchasing.returns',
        moduleKey: 'purchasing',
        label: 'Retur Pembelian',
        pattern: /^\/purchasing\/returns(?:\/.*)?$/,
        priority: 90,
    },
    {
        featureKey: 'purchasing.suppliers.detail',
        moduleKey: 'purchasing',
        label: 'Detail Supplier',
        pattern: /^\/purchasing\/suppliers\/[^/]+$/,
        priority: 100,
    },
    {
        featureKey: 'purchasing.suppliers.list',
        moduleKey: 'purchasing',
        label: 'Master Supplier',
        pattern: /^\/purchasing\/suppliers$/,
        priority: 90,
    },
    {
        featureKey: 'purchasing.analytics',
        moduleKey: 'purchasing',
        label: 'Analitik Pembelian',
        pattern: /^\/purchasing\/analytics(?:\/.*)?$/,
        priority: 90,
    },
    {
        featureKey: 'purchasing.overview',
        moduleKey: 'purchasing',
        label: 'Ikhtisar Pembelian',
        pattern: /^\/purchasing$/,
        priority: 80,
    },

    // ─── FINANCE MODULE (Actual Routes) ─────────────────────────
    {
        featureKey: 'finance.coa',
        moduleKey: 'finance',
        label: 'Bagan Akun (CoA)',
        pattern: /^\/finance\/coa(?:\/.*)?$/,
        priority: 90,
    },
    {
        featureKey: 'finance.journals.detail',
        moduleKey: 'finance',
        label: 'Detail Jurnal Umum',
        pattern: /^\/finance\/journals\/[^/]+$/,
        priority: 100,
    },
    {
        featureKey: 'finance.journals.list',
        moduleKey: 'finance',
        label: 'Jurnal Umum / Ledgers',
        pattern: /^\/finance\/journals$/,
        priority: 90,
    },
    {
        featureKey: 'finance.invoices.sales',
        moduleKey: 'finance',
        label: 'Faktur Penjualan (AR)',
        pattern: /^\/finance\/invoices\/sales(?:\/.*)?$/,
        priority: 95,
    },
    {
        featureKey: 'finance.invoices.purchase',
        moduleKey: 'finance',
        label: 'Tagihan Pembelian (AP)',
        pattern: /^\/finance\/invoices\/purchase(?:\/.*)?$/,
        priority: 95,
    },
    {
        featureKey: 'finance.petty_cash',
        moduleKey: 'finance',
        label: 'Kas Kecil (Petty Cash)',
        pattern: /^\/finance\/petty-cash(?:\/.*)?$/,
        priority: 90,
    },
    {
        featureKey: 'finance.bank_reconciliation',
        moduleKey: 'finance',
        label: 'Rekonsiliasi Bank',
        pattern: /^\/finance\/bank-reconciliation(?:\/.*)?$/,
        priority: 95,
    },
    {
        featureKey: 'finance.fixed_assets',
        moduleKey: 'finance',
        label: 'Aset Tetap & Depresiasi',
        pattern: /^\/finance\/assets(?:\/.*)?$/,
        priority: 90,
    },
    {
        featureKey: 'finance.reports',
        moduleKey: 'finance',
        label: 'Laporan Keuangan',
        pattern: /^\/finance\/reports(?:\/.*)?$/,
        priority: 90,
    },
    {
        featureKey: 'finance.budgeting',
        moduleKey: 'finance',
        label: 'Penganggaran & Variansi',
        pattern: /^\/finance\/budgeting(?:\/.*)?$/,
        priority: 90,
    },
    {
        featureKey: 'finance.aging',
        moduleKey: 'finance',
        label: 'Umur Piutang & Hutang',
        pattern: /^\/finance\/aging(?:\/.*)?$/,
        priority: 90,
    },
    {
        featureKey: 'finance.periods',
        moduleKey: 'finance',
        label: 'Tutup Buku & Periode Akuntansi',
        pattern: /^\/finance\/periods(?:\/.*)?$/,
        priority: 90,
    },
    {
        featureKey: 'finance.payments',
        moduleKey: 'finance',
        label: 'Pembayaran Received/Sent',
        pattern: /^\/finance\/payments(?:\/.*)?$/,
        priority: 90,
    },
    {
        featureKey: 'finance.overview',
        moduleKey: 'finance',
        label: 'Ikhtisar Keuangan',
        pattern: /^\/finance$/,
        priority: 80,
    },

    // ─── HRD MODULE ─────────────────────────
    {
        featureKey: 'hrd.employees.detail',
        moduleKey: 'hrd',
        label: 'Profil Karyawan',
        pattern: /^\/hrd\/employees\/[^/]+$/,
        priority: 100,
    },
    {
        featureKey: 'hrd.employees.list',
        moduleKey: 'hrd',
        label: 'Daftar Karyawan',
        pattern: /^\/hrd\/employees$/,
        priority: 90,
    },
    {
        featureKey: 'hrd.attendance',
        moduleKey: 'hrd',
        label: 'Kehadiran & Presensi',
        pattern: /^\/hrd\/attendance(?:\/.*)?$/,
        priority: 90,
    },
    {
        featureKey: 'hrd.payroll',
        moduleKey: 'hrd',
        label: 'Penggajian & Slip Gaji',
        pattern: /^\/hrd\/payroll(?:\/.*)?$/,
        priority: 90,
    },
    {
        featureKey: 'hrd.payroll_monthly',
        moduleKey: 'hrd',
        label: 'Payroll Bulanan Karyawan',
        pattern: /^\/hrd\/payroll-monthly(?:\/.*)?$/,
        priority: 95,
    },
    {
        featureKey: 'hrd.leave',
        moduleKey: 'hrd',
        label: 'Cuti & Izin',
        pattern: /^\/hrd\/leave(?:\/.*)?$/,
        priority: 90,
    },
    {
        featureKey: 'hrd.disciplinary',
        moduleKey: 'hrd',
        label: 'Tindakan Disiplin',
        pattern: /^\/hrd\/disciplinary(?:\/.*)?$/,
        priority: 90,
    },
    {
        featureKey: 'hrd.bpjs',
        moduleKey: 'hrd',
        label: 'Rekapitulasi BPJS',
        pattern: /^\/hrd\/bpjs(?:\/.*)?$/,
        priority: 90,
    },
    {
        featureKey: 'hrd.loans',
        moduleKey: 'hrd',
        label: 'Kasbon & Pinjaman Karyawan',
        pattern: /^\/hrd\/loans(?:\/.*)?$/,
        priority: 90,
    },
    {
        featureKey: 'hrd.overview',
        moduleKey: 'hrd',
        label: 'Ikhtisar HRD',
        pattern: /^\/hrd$/,
        priority: 80,
    },

    // ─── MAKLON MODULE ─────────────────────────
    {
        featureKey: 'maklon.receipts',
        moduleKey: 'maklon',
        label: 'Penerimaan Hasil Maklon',
        pattern: /^\/maklon\/receipts(?:\/.*)?$/,
        priority: 90,
    },
    {
        featureKey: 'maklon.returns',
        moduleKey: 'maklon',
        label: 'Retur Material Maklon',
        pattern: /^\/maklon\/returns(?:\/.*)?$/,
        priority: 90,
    },
    {
        featureKey: 'maklon.overview',
        moduleKey: 'maklon',
        label: 'Ikhtisar Maklon',
        pattern: /^\/maklon$/,
        priority: 80,
    },

    // ─── FIELD / MOBILE ─────────────────────────
    {
        featureKey: 'field.sales_mobile',
        moduleKey: 'field',
        label: 'Portal Mobile Sales Field',
        pattern: /^\/field\/sales(?:\/.*)?$/,
        priority: 90,
    },

    // ─── SETTINGS MODULE ─────────────────────────
    {
        featureKey: 'settings.users',
        moduleKey: 'settings',
        label: 'Pengaturan Pengguna',
        pattern: /^\/settings\/users(?:\/.*)?$/,
        priority: 90,
    },
    {
        featureKey: 'settings.roles',
        moduleKey: 'settings',
        label: 'Pengaturan Peran & Akses',
        pattern: /^\/settings\/roles(?:\/.*)?$/,
        priority: 90,
    },
    {
        featureKey: 'settings.profile',
        moduleKey: 'settings',
        label: 'Profil Akun Saya',
        pattern: /^\/settings\/profile(?:\/.*)?$/,
        priority: 90,
    },
    {
        featureKey: 'settings.tenant',
        moduleKey: 'settings',
        label: 'Pengaturan Tenant',
        pattern: /^\/settings\/tenant(?:\/.*)?$/,
        priority: 90,
    },
    {
        featureKey: 'settings.overview',
        moduleKey: 'settings',
        label: 'Pengaturan Sistem',
        pattern: /^\/settings$/,
        priority: 80,
    },

    // ─── SUPPORT & USER HELP ─────────────────────────
    {
        featureKey: 'support.help_center',
        moduleKey: 'support',
        label: 'Pusat Bantuan / Virtual CS',
        pattern: /^\/support(?:\/.*)?$/,
        priority: 90,
    },
];

// Patterns for paths that MUST BE EXCLUDED from feature usage analytics
const EXCLUDED_PATTERNS = [
    /^\/_next\//,
    /^\/api\//,
    /^\/admin\//, // Exclude admin platform views from tenant adoption metrics
    /^\/admin$/,
    /^\/kiosk(?:\/.*)?$/, // Exclude kiosk public/operator session
    /^\/my(?:\/.*)?$/, // Exclude /my employee self portal
    /^\/device\//,
    /^\/favicon\.ico$/,
    /^\/robots\.txt$/,
    /^\/sitemap\.xml$/,
    /^\/login$/,
    /^\/logout$/,
    /^\/register$/,
    /^\/privacy$/,
    /^\/terms$/,
];

export function normalizePathname(rawPathname: string): string {
    if (!rawPathname) return '';
    const clean = rawPathname.split('?')[0].split('#')[0].trim();
    let normalized = clean.startsWith('/') ? clean : `/${clean}`;
    if (normalized.length > 1 && normalized.endsWith('/')) {
        normalized = normalized.slice(0, -1);
    }
    return normalized;
}

export function resolveFeatureFromPath(
    rawPathname: string,
): FeatureResolveResult | null {
    const cleanPath = normalizePathname(rawPathname);
    if (!cleanPath) return null;

    for (const excludedPattern of EXCLUDED_PATTERNS) {
        if (excludedPattern.test(cleanPath)) {
            return null;
        }
    }

    const sortedFeatures = [...FEATURE_REGISTRY].sort(
        (a, b) => b.priority - a.priority,
    );

    for (const feat of sortedFeatures) {
        if (feat.pattern.test(cleanPath)) {
            return {
                featureKey: feat.featureKey,
                moduleKey: feat.moduleKey,
                label: feat.label,
            };
        }
    }

    return null;
}

export function getAllRegisteredFeatures(): {
    featureKey: string;
    moduleKey: string;
    label: string;
}[] {
    return FEATURE_REGISTRY.map((f) => ({
        featureKey: f.featureKey,
        moduleKey: f.moduleKey,
        label: f.label,
    }));
}
