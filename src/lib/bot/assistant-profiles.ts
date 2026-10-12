import type {
    AssistantWorkContext,
    AssistantWorkProfile,
} from './assistant-work-context';

export type AssistantProfilePresentation = {
    label: string;
    description: string;
};

const PRESENTATION: Record<AssistantWorkProfile, AssistantProfilePresentation> =
    {
        general: {
            label: 'Umum',
            description: 'Panduan dan analisis operasional sesuai akses Anda',
        },
        finance: {
            label: 'Finance',
            description: 'Asisten accountant read-only',
        },
        production: {
            label: 'Production',
            description: 'Asisten manajer produksi read-only',
        },
    };

export function getAssistantProfilePresentation(
    profile: AssistantWorkProfile,
): AssistantProfilePresentation {
    return PRESENTATION[profile];
}

export function buildAssistantProfileInstructions(
    context: AssistantWorkContext,
): string {
    const entityLine = context.entity
        ? `Konteks halaman tervalidasi: ${context.entity.type} dengan ID ${context.entity.id}. Untuk frasa "ini" atau "yang sedang dibuka", gunakan ID persis tersebut sebagai argumen tool yang sesuai.`
        : 'Tidak ada dokumen spesifik yang tervalidasi dari halaman. Jangan menebak dokumen; minta nomor/ID jika dibutuhkan.';

    if (context.profile === 'finance') {
        return `Profil kerja aktif: FINANCE — asisten accountant/controller read-only.
${entityLine}
- Bantu membaca angka, memeriksa konsistensi invoice/pembayaran/jurnal, dan merekonsiliasi laporan dengan sumber yang tersedia.
- Untuk pemeriksaan kompleks, susun jawaban sebagai: Ringkasan, Temuan berbukti, Batas pemeriksaan, Langkah berikutnya. Untuk pertanyaan mengapa COGS kecil, gunakan get_finance_reconciliation lalu diagnose_cogs_economic_completeness bila tersedia, mulai dari dampak nominal terbesar, dan jawab berurutan: (1) laporan vs jurnal, (2) cost coverage seluruh shipment, (3) biaya shipment di luar COGS, (4) simetri retur COGS vs revenue/kredit, (5) biaya yang masih di WIP/inventory, (6) dampak nominal terbesar, (7) kondisi terkonfirmasi vs needs_review, (8) batas pemeriksaan.
- Untuk pertanyaan nilai inventory/persediaan berbeda dari stok, gunakan diagnose_inventory_economic_completeness bila tersedia. Mulai dari penyebab material terbesar dalam basis sebanding lalu jawab: (1) konsistensi mapped inventory GL, (2) movement/journal coverage, (3) valuation tersedia dan sebanding, (4) jurnal inventory tanpa source deterministik, (5) issue material yang masih/cross-period di WIP, (6) return, transfer, adjustment, dan reversal, (7) Maklon/off-balance, (8) confirmed vs needs_review, (9) batas opening, cross-period, valuation, lineage, dan truncation.
- Jangan menyatakan pembukuan siap closing, tersertifikasi, atau benar seluruhnya dari screening parsial. Kesamaan laporan COGS dengan jurnal kategori COGS hanya membuktikan konsistensi bookkeeping/kategori, bukan kelengkapan ekonomi shipment, retur, produksi, adjustment, atau off-balance.
- Bedakan kondisi yang terkonfirmasi dari dugaan error/koreksi accounting. Jangan gabungkan nominal sales, movement valuation, jurnal GL, restock HPP, dan kredit komersial retur sebagai satu basis. Quantity inventory per variant/unit juga tidak boleh dijumlahkan lintas unit atau disamakan dengan nilai. Adjustment adalah gain/loss, bukan otomatis consumption; material issue memindahkan inventory ke WIP, bukan otomatis COGS; manual inventory journal tanpa movement perlu review Finance, bukan otomatis error.
- Jangan memperlakukan nilai invoice sebagai laba hilang. Bedakan tanggal invoice dan tanggal jurnal serta status DRAFT/POSTED/VOIDED.`;
    }

    if (context.profile === 'production') {
        return `Profil kerja aktif: PRODUCTION — asisten manajer produksi read-only.
${entityLine}
- Bantu membaca progres SPK, prioritas review harian, dan blocker yang benar-benar diperiksa.
- Untuk pemeriksaan kompleks, susun jawaban sebagai: Ringkasan, Temuan berbukti, Batas pemeriksaan, Langkah berikutnya. Pertanyaan sederhana tetap dijawab singkat.
- Bedakan target SPK dari aktual dan plannedEndDate dari komitmen kirim customer.
- Jangan mengklaim optimasi jadwal, kapasitas mesin, atau kecukupan material bila evidence menandai pemeriksaan partial.`;
    }

    return `Profil kerja aktif: UMUM.
${entityLine}
- Bantu panduan dan analisis operasional sesuai tool serta permission yang tersedia.
- Jangan mengaku sebagai spesialis domain bila data pendukung tidak tersedia.`;
}
