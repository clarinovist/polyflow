/**
 * Fast-path untuk sapaan / small talk.
 *
 * Tanpa ini, "halo" menempuh seluruh agentic loop (~9 detik + 1 call LLM) hanya
 * untuk berakhir di `analyzeForClarification` (clarifier.ts:60, `q.length < 5`)
 * yang meminta user menjelaskan ulang. Boros dan lambat untuk pesan pembuka yang
 * jawabannya selalu sama.
 *
 * Sengaja konservatif: hanya cocok untuk pesan pendek yang MURNI sapaan. Begitu
 * user menempelkan pertanyaan nyata ("halo, kenapa SO belum bisa dikirim"),
 * fungsi ini harus melepaskannya ke jalur agentic penuh.
 */

const GREETING_WORDS = [
    'halo',
    'hallo',
    'helo',
    'hai',
    'hi',
    'hey',
    'pagi',
    'siang',
    'sore',
    'malam',
    'assalamualaikum',
    'assalamu alaikum',
    'salam',
    'permisi',
    'test',
    'tes',
    'ping',
];

/** Kata sopan yang boleh menempel pada sapaan tanpa membatalkannya. */
const FILLER_WORDS = [
    'selamat',
    'pak',
    'bu',
    'bang',
    'kak',
    'mas',
    'mbak',
    'min',
    'admin',
    'bot',
    'dong',
    'ya',
    'yaa',
    'nih',
    'kok',
    'saya',
    'aku',
    'mau',
    'tanya',
    'nanya',
    'bertanya',
    'bantuan',
    'bantu',
    'help',
];

const MAX_GREETING_LENGTH = 40;

export type GreetingResult = {
    isGreeting: boolean;
    reply?: string;
    suggestions?: string[];
};

const SUGGESTIONS = [
    'Cek stok barang MP 15 di gudang',
    'Kenapa SO belum bisa dikirim?',
    'Cara input hasil produksi shift 2',
];

function buildReply(requesterName?: string): string {
    const sapaan = requesterName ? `Halo, ${requesterName}!` : 'Halo!';
    return [
        `${sapaan} Saya Asisten Kerja Polyflow. 👋`,
        '',
        'Saya bisa bantu cek data operasional (stok, SO, SPK, invoice, pengiriman), menelusuri kenapa sesuatu tertahan, dan menjelaskan cara pakai menu Polyflow.',
        '',
        'Contoh yang bisa langsung Anda tanyakan:',
        ...SUGGESTIONS.map((s) => `- ${s}`),
        '',
        'Silakan tanya dengan bahasa sehari-hari — sebutkan nomor transaksi atau nama barang kalau ada, supaya saya bisa langsung cek datanya.',
    ].join('\n');
}

/**
 * Deteksi apakah pesan murni sapaan tanpa pertanyaan nyata.
 *
 * Melepaskan (isGreeting: false) bila pesan mengandung tanda tanya, angka,
 * terlalu panjang, atau memuat kata di luar daftar sapaan + filler — karena
 * itu tanda ada muatan pertanyaan yang butuh jalur agentic penuh.
 */
export function detectGreeting(
    question: string,
    requesterName?: string,
): GreetingResult {
    const trimmed = question.trim();

    if (!trimmed || trimmed.length > MAX_GREETING_LENGTH) {
        return { isGreeting: false };
    }

    // Tanda tanya atau angka → ada pertanyaan/identifier nyata di dalamnya.
    if (/[?]/.test(trimmed) || /\d/.test(trimmed)) {
        return { isGreeting: false };
    }

    const words = trimmed
        .toLowerCase()
        .replace(/[.,!;:\-—]+/g, ' ')
        .split(/\s+/)
        .filter(Boolean);

    if (words.length === 0) return { isGreeting: false };

    const hasGreetingWord = words.some((w) => GREETING_WORDS.includes(w));
    if (!hasGreetingWord) return { isGreeting: false };

    // Setiap kata harus sapaan atau filler sopan. Satu kata asing → lepas.
    const allKnown = words.every(
        (w) => GREETING_WORDS.includes(w) || FILLER_WORDS.includes(w),
    );
    if (!allKnown) return { isGreeting: false };

    return {
        isGreeting: true,
        reply: buildReply(requesterName),
        suggestions: SUGGESTIONS,
    };
}
