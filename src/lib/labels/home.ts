/** Shared destinations for the public landing page. */
export const homeLinks = {
    contactSales:
        'mailto:marketing@polyflow.uk?subject=Permintaan%20Demo%20PolyFlow',
    exploreWorkflow: '#features',
    whyPolyflow: '#why-polyflow',
    register: '/register',
    login: '/login',
} as const;

/** Public navigation labels */
export const navLabels = {
    workflow: 'Alur Kerja',
    whyPolyflow: 'Kenapa PolyFlow',
    tenantLogin: 'Login Tenant',
    contactSales: 'Jadwalkan Demo',
    openMenu: 'Buka menu',
    closeMenu: 'Tutup menu',
} as const;

/** Hero section labels */
export const heroLabels = {
    badge: 'ERP Produksi untuk Pabrik Plastik Berbasis Ekstrusi',
    headline: 'Kendalikan produksi pabrik plastik',
    headlineAccent: 'dari bahan baku',
    headlineEnd: 'sampai barang jadi.',
    tagline:
        'PolyFlow menghubungkan pesanan, bahan, mesin, hasil produksi, scrap, stok, pengiriman, dan invoice dalam satu sistem—dibangun dari penggunaan operasional pada kantong HDPE, tali rafia, dan sedotan.',
    contactSales: 'Jadwalkan Demo',
    exploreWorkflow: 'Lihat Alur Kerja',
} as const;

/** Anonymous, public-safe proof of current operational use. */
export const heroStats = [
    { value: 'HDPE', label: 'Kantong Plastik' },
    { value: 'Rafia', label: 'Tali & Gulungan' },
    { value: 'Sedotan', label: 'Ekstrusi & Cutting' },
] as const;

/** Hero pipeline panel — a simplified operational flow. */
export const heroPipeline = {
    title: 'Alur Operasional PolyFlow',
    steps: [
        { num: '01', label: 'Pesanan', desc: 'Kebutuhan pelanggan dicatat' },
        {
            num: '02',
            label: 'Bahan & Resep',
            desc: 'Material dan formula disiapkan',
        },
        {
            num: '03',
            label: 'Produksi',
            desc: 'Proses, output, dan scrap dicatat',
        },
        {
            num: '04',
            label: 'Stok & Pengiriman',
            desc: 'Barang jadi siap ditelusuri',
        },
    ],
} as const;

/** Capabilities section labels */
export const featureLabels = {
    sectionTitle: 'Alur PolyFlow',
    sectionHeading: 'Satu jejak operasional dari pesanan sampai pengiriman',
    sectionDescription:
        'Setiap area bekerja dengan transaksi yang saling terhubung, sehingga bahan, pekerjaan produksi, hasil, stok, dan dokumen komersial dapat ditelusuri.',
    items: {
        warehouse: {
            title: 'Gudang & Bahan',
            description:
                'Catat penerimaan, perpindahan, pemakaian, dan opname resin, additive, WIP, bahan pengemas, serta barang jadi per lokasi.',
        },
        production: {
            title: 'Production Order',
            description:
                'Hubungkan BOM atau resep, kebutuhan bahan, tahap proses, mesin, output, dan scrap dalam satu pekerjaan produksi.',
        },
        sales: {
            title: 'Pesanan Pelanggan',
            description:
                'Hubungkan pesanan dengan kebutuhan produksi, kesiapan stok, surat jalan, dan status pengiriman.',
        },
        finance: {
            title: 'Costing & Finance',
            description:
                'Gunakan jejak transaksi bahan dan produksi sebagai dasar peninjauan costing, invoice, serta laporan finance.',
        },
        analytics: {
            title: 'Tinjauan Operasional',
            description:
                'Tinjau status order, aktivitas produksi, stok, dan indikator operasional dari transaksi yang telah dicatat.',
        },
        logistics: {
            title: 'Pengiriman',
            description:
                'Catat kesiapan barang, delivery order, kendaraan, dan penyelesaian pengiriman pada alur yang sama.',
        },
    },
} as const;

/** CTA section labels */
export const ctaLabels = {
    badge: 'Demo Berdasarkan Alur Pabrik Anda',
    heading: 'Ceritakan proses produksi',
    headingAccent: 'yang ingin Anda rapikan.',
    description:
        'Kami akan menyiapkan demo yang berfokus pada produk, tahap mesin, aliran bahan, output, scrap, dan pengiriman yang relevan—bukan presentasi seluruh modul.',
    primaryCta: 'Diskusikan lewat Email',
    secondaryCta: 'Login Tenant',
} as const;

/** Public footer labels */
export const footerLabels = {
    description:
        'ERP produksi untuk pabrik plastik berbasis ekstrusi. Hubungkan pesanan, bahan, proses, hasil, scrap, stok, pengiriman, dan invoice dalam satu sistem.',
    product: 'Produk',
    company: 'Perusahaan',
    features: 'Alur Kerja',
    testimonials: 'Kenapa PolyFlow',
    contactSales: 'Jadwalkan Demo',
    register: 'Daftar',
    tenantLogin: 'Login Tenant',
    termsOfService: 'Ketentuan Layanan',
    privacyPolicy: 'Kebijakan Privasi',
    copyright: '© {year} PolyFlow ERP Systems. Hak cipta dilindungi.',
    craftedFor: 'Dibangun dari operasi kantong HDPE, tali rafia, dan sedotan.',
} as const;

/** Workflow-grounded reasons to choose PolyFlow; not customer testimonials. */
export const whyPolyflow = {
    sectionTitle: 'Kenapa PolyFlow',
    sectionHeading: 'Dibangun dari alur pabrik plastik berbasis ekstrusi',
    sectionDescription:
        'PolyFlow tidak dimulai sebagai ERP manufaktur umum. Model operasionalnya dikembangkan dari penggunaan pada kantong HDPE, tali rafia, dan sedotan.',
    items: {
        traceableMaterials: {
            title: 'Bahan dan Stok Dapat Ditelusuri',
            description:
                'Catat penerimaan, perpindahan, pemakaian bahan, serta hasil produksi beserta lokasi dan referensi transaksinya.',
        },
        orderVisibility: {
            title: 'Produksi Terlihat per Order',
            description:
                'Hubungkan production order dengan bahan yang dicatat, tahap proses, hasil, dan scrap tanpa rekap akhir yang terpisah.',
        },
        operationalUnits: {
            title: 'Satuan Mengikuti Operasi Pabrik',
            description:
                'Kelola produk dalam satuan seperti KG, roll, bal, pack, dan piece berdasarkan konfigurasi master produk.',
        },
        provenWorkflows: {
            title: 'Satu Platform, Beberapa Keluarga Produk',
            description:
                'Workflow yang sama telah digunakan dalam operasi kantong HDPE, tali rafia, dan sedotan tanpa mengklaim semua proses plastik otomatis cocok.',
        },
    },
} as const;
