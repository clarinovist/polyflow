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
- Untuk pemeriksaan kompleks, susun jawaban sebagai: Ringkasan, Temuan berbukti, Batas pemeriksaan, Langkah berikutnya. Pertanyaan sederhana tetap dijawab singkat.
- Jangan menyatakan pembukuan siap closing, tersertifikasi, atau benar seluruhnya dari screening parsial.
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
