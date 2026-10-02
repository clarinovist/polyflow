/** Intent hints guide the answer, never authorization or tool availability. */
export type AssistantIntent =
    | 'guidance'
    | 'diagnosis'
    | 'data'
    | 'execution'
    | 'conversation';

export function detectAssistantIntent(question: string): AssistantIntent {
    if (/\b(kenapa|knp|mengapa|kok|error|gagal|kendala)\b/i.test(question))
        return 'diagnosis';
    if (
        /\b(cara|caranya|bagaimana|gimana|gmn|tutorial|panduan|langkah|jelaskan|apa itu|sebelah mana|di mana|dimana)\b/i.test(
            question,
        )
    )
        return 'guidance';
    if (
        /\b(tolong|langsung|sekarang)\b.*\b(hapus|ubah|post|posting|approve|void|tutup)\b|\b(hapuskan|buatkan|postkan|tutupkan)\b/i.test(
            question,
        )
    )
        return 'execution';
    if (
        /\b(cek|lihat|berapa|apakah ada|ada berapa|tampilkan)\b/i.test(question)
    )
        return 'data';
    return 'conversation';
}

export function buildIntentInstructions(
    question: string,
    semantic?: {
        intent: AssistantIntent;
        route: 'data_tools' | 'knowledge_base' | 'clarify' | 'conversation';
        routeConfidence: number;
        needsClarification: number;
    },
): string {
    const intent = semantic?.intent ?? detectAssistantIntent(question);
    const semanticRoute = semantic
        ? `\nRute semantik: ${semantic.route}; probabilitas perlu klarifikasi: ${semantic.needsClarification.toFixed(2)}.`
        : '';
    return `Petunjuk maksud pesan: ${intent} (bukan izin akses).${semanticRoute}
- Pertanyaan "cara", "gimana", "bagaimana", atau lokasi menu meminta PANDUAN, bukan meminta Anda melakukan transaksi. Jawab langkah terverifikasi terlebih dahulu; jangan membuka dengan penolakan read-only.
- Read-only melarang ANDA mengeksekusi perubahan, bukan menjelaskan langkah UI yang dilakukan pengguna berwenang. Jangan mengatakan tidak boleh memandu klik yang mengubah status.
- "Apakah ada draft retur?" meminta pemeriksaan data, bukan sekadar definisi draft. Jika tool relevan tidak tersedia, nyatakan batas itu singkat; jangan mengganti pemeriksaan data dengan pencarian artikel.
- Jika rute semantik data_tools, prioritaskan tool data yang relevan dan jangan gunakan Knowledge Base sebagai pengganti pemeriksaan data aktual.
- Jika rute semantik knowledge_base, gunakan artikel terverifikasi dan jangan mengarang menu/path dari kebiasaan ERP umum.
- Jika rute semantik clarify, ajukan hanya satu pertanyaan paling menentukan sebelum memberi daftar langkah panjang.
- "Akun baru" dapat berarti akun buku besar/COA atau akun login. Gunakan konteks percakapan yang sudah ada; bila belum jelas, tanyakan satu pilihan ini, jangan menebak atau meminta ulang detail.
- Jangan menganggap dokumen tidak ada atau fitur tidak tersedia hanya karena pencarian KB kosong. Bedakan tidak menemukan panduan dari tidak menemukan transaksi.
- Ketika user mengulang atau mengoreksi maksud, jawab maksud terbaru; jangan mengulang daftar keterbatasan atau mengarang aturan ERP umum sebagai aturan Polyflow.`;
}
