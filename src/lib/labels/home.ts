/** Shared CTA destinations for the public landing page.
 *  `#contact` is the CTA section (cta-section-enhanced.tsx has id="contact").
 *  Final destination (WhatsApp / form / email) is still pending a product decision —
 *  see docs/plan/2026-08-24-landing-page-design-hardening.md §9. */
export const homeLinks = {
    contactSales: '#contact',
    exploreFeatures: '#features',
    testimonials: '#testimonials',
    register: '/register',
    login: '/login',
} as const;

/** Public navigation labels */
export const navLabels = {
    features: 'Fitur',
    testimonials: 'Testimoni',
    tenantLogin: 'Login Tenant',
    contactSales: 'Hubungi Penjualan',
    openMenu: 'Buka menu',
    closeMenu: 'Tutup menu',
} as const;

/** Hero section labels */
export const heroLabels = {
    badge: 'Dibangun untuk Industri Plastik Konverting',
    headline: 'Optimalkan operasi',
    headlineAccent: 'manufaktur',
    headlineEnd: 'Anda',
    tagline:
        'Sistem ERP Konversi Plastik tingkat lanjut. Satukan gudang, produksi, penjualan, dan keuangan dalam satu platform yang kuat.',
    contactSales: 'Hubungi Penjualan',
    exploreFeatures: 'Jelajahi Fitur',
    trustedBy: 'Dipercaya oleh 1.000+ produsen di seluruh dunia',
} as const;

/** Hero stats strip — small numbers below the CTA */
export const heroStats = [
    { value: '6', label: 'Modul Terintegrasi' },
    { value: '1', label: 'Sistem, Bukan Taburan' },
    { value: '∞', label: 'Pelacakan Real-time' },
] as const;

/** Hero pipeline panel — the vertical flow diagram on the right side */
export const heroPipeline = {
    title: 'Alur Produksi PolyFlow',
    steps: [
        { num: '01', label: 'Sales Order', desc: 'Pesanan masuk' },
        { num: '02', label: 'Produksi', desc: 'Mesin & BOM' },
        { num: '03', label: 'Gudang', desc: 'Stok & Material' },
        { num: '04', label: 'Invoice', desc: 'Tagih & Lunas' },
    ],
} as const;

/** Features section labels */
export const featureLabels = {
    sectionTitle: 'Modul',
    sectionHeading: 'Semua Yang Anda Butuhkan',
    sectionDescription:
        'Dibangun dari awal untuk operasi konversi plastik. Setiap modul bekerja secara mulus bersama.',
    items: {
        warehouse: {
            title: 'Gudang & Inventaris',
            description:
                'Pelacakan stok real-time, pemesanan ulang otomatis, dan manajemen material presisi di seluruh fasilitas Anda.',
        },
        production: {
            title: 'Perencanaan Produksi',
            description:
                'Optimalkan jadwal manufaktur, lacak waktu aktif mesin, dan kelola pesanan kerja secara mulus.',
        },
        sales: {
            title: 'Penjualan & CRM',
            description:
                'Kelola hubungan pelanggan, lacak pesanan penjualan, dan ramalkan pipeline dengan wawasan cerdas.',
        },
        finance: {
            title: 'Keuangan & Akuntansi',
            description:
                'Pembukuan terintegrasi, penagihan otomatis, dan pelaporan keuangan mendalam untuk seluruh operasi Anda.',
        },
        analytics: {
            title: 'Analitik & Laporan',
            description:
                'Dashboard real-time, analisis tren, dan KPI yang dapat ditindaklanjuti untuk keputusan bisnis yang lebih cerdas.',
        },
        logistics: {
            title: 'Logistik & Pengiriman',
            description:
                'Pelacakan pengiriman end-to-end, penjadwalan pengiriman, dan manajemen biaya angkutan dalam satu tampilan.',
        },
    },
} as const;

/** CTA section labels */
export const ctaLabels = {
    badge: 'Mulai Sekarang',
    heading: 'Siap mengoptimalkan',
    headingAccent: 'pabrik Anda?',
    description:
        'Buat workspace untuk perusahaan Anda, atau masuk ke tenant yang sudah ada. Setiap modul siap dipakai sejak hari pertama.',
    primaryCta: 'Buat Workspace',
    secondaryCta: 'Login Tenant',
} as const;

/** Public footer labels */
export const footerLabels = {
    description:
        'Sistem ERP Konversi Plastik tingkat lanjut yang dibangun untuk operasi manufaktur modern. Optimalkan gudang, produksi, penjualan, dan keuangan Anda.',
    product: 'Produk',
    company: 'Perusahaan',
    features: 'Fitur',
    testimonials: 'Testimoni',
    contactSales: 'Hubungi Penjualan',
    register: 'Daftar',
    tenantLogin: 'Login Tenant',
    termsOfService: 'Ketentuan Layanan',
    privacyPolicy: 'Kebijakan Privasi',
    copyright: '© {year} PolyFlow ERP Systems. Hak cipta dilindungi.',
    craftedFor: 'Dibuat untuk industri konversi plastik.',
} as const;
