import type {
    AssistantResponse,
    CitedArticleForResponse,
} from './assistant-types';
import type { HelpSearchResult } from './help-articles';
import {
    isReproducibleBugCandidate,
    missingReproductionFields,
    parseReproduction,
    REPRODUCTION_LABELS,
    type BugReproduction,
} from './bug-triage';

const ISSUE_REPORT_PATTERN =
    /\b(tidak\s+bisa|nggak\s+bisa|gagal|error|berubah|hilang|ditolak|beda|tidak\s+sesuai|koma|desimal)\b/i;
const UI_INPUT_CONTEXT_PATTERN =
    /\b(input|kolom|field|form|layar|tombol|menu|penulisan|ketik|diketik|tampil|tampilan|koma|desimal|nominal|nilai)\b/i;
const CRITICAL_TRANSACTION_PATTERN =
    /\b(nominal|nilai|harga|jumlah|total|uang|rupiah|stok|qty|kuantitas|gaji|payroll|jurnal|invoice|pembayaran|posting|post)\b/i;
const STOP_WORDS = new Set([
    'yang',
    'dan',
    'atau',
    'tidak',
    'bisa',
    'nggak',
    'saya',
    'kami',
    'dengan',
    'untuk',
    'pada',
    'dari',
    'jadi',
    'kok',
    'error',
]);

export function isUiIssueReport(question: string): boolean {
    return (
        ISSUE_REPORT_PATTERN.test(question) &&
        UI_INPUT_CONTEXT_PATTERN.test(question)
    );
}

function searchableTokens(value: string): string[] {
    return value
        .toLocaleLowerCase('id-ID')
        .replace(/[^a-z0-9]+/g, ' ')
        .split(/\s+/)
        .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

export function isRelevantTroubleshootingArticle(
    question: string,
    article: HelpSearchResult,
): boolean {
    const questionTokens = new Set(searchableTokens(question));
    const articleTokens = new Set(
        searchableTokens(
            [
                article.title,
                article.summary,
                article.tags.join(' '),
                article.bodyExcerpt,
            ].join(' '),
        ),
    );

    return [...questionTokens].some((token) => articleTokens.has(token));
}

function reproductionRequest(
    question: string,
    options: {
        acknowledgeInsufficientEvidence?: boolean;
        details: BugReproduction;
    },
): string {
    const safetyWarning = CRITICAL_TRANSACTION_PATTERN.test(
        `${question} ${Object.values(options.details).join(' ')}`,
    )
        ? '\n\nUntuk keamanan transaksi, **jangan simpan, post, atau lanjutkan transaksi jika nominal/nilai yang tampil berubah dari input Anda**.'
        : '';

    const evidenceLimit = options.acknowledgeInsufficientEvidence
        ? 'Saya belum dapat memastikan penyebabnya dari data yang tersedia, karena saya tidak dapat melihat keadaan form di perangkat Anda. '
        : '';

    const missing = missingReproductionFields(options.details);
    const prompts: Record<keyof BugReproduction, string> = {
        page: 'nama halaman yang bermasalah',
        field: 'nama field/kolom',
        input: 'input persis yang diketik (gunakan contoh samaran)',
        expected: 'hasil yang seharusnya tampil',
        actual: 'hasil yang tampil atau pesan error',
        steps: 'urutan dari membuka halaman sampai masalah terjadi',
        repeated:
            'ya/tidak; apakah langkah yang sama selalu menghasilkan masalah ini?',
    };
    const request = missing.length
        ? `Detail reproduksi yang masih diperlukan:\n${missing.map((key) => `- ${REPRODUCTION_LABELS[key]}: ${prompts[key]}`).join('\n')}\n\nBalas dengan label tersebut, satu per baris. Jangan kirim password, token, atau data pelanggan. Jika detailnya cukup, dugaan bug bisa diteruskan untuk review support.`
        : 'Detail sudah diterima, tetapi belum cukup untuk menggolongkannya sebagai dugaan bug yang berulang. Periksa apakah hasilnya memang berbeda dari harapan, dapat diulang, dan bukan penolakan akses, aturan bisnis, atau masalah koneksi. Jika sudah diperiksa, kirim ulang detail reproduksi yang diperbarui.';
    return `Paham, kendala ini bisa menghambat pekerjaan Anda. ${evidenceLimit}Saya tidak akan menyimpulkan penyebab tanpa bukti.${safetyWarning}\n\n${request}`;
}

export function buildTroubleshootingResponse(
    question: string,
    searchResults: HelpSearchResult[],
    details: BugReproduction = parseReproduction(question),
): AssistantResponse {
    if (isReproducibleBugCandidate(details)) {
        const warning = CRITICAL_TRANSACTION_PATTERN.test(
            `${question} ${Object.values(details).join(' ')}`,
        )
            ? '\n\nUntuk keamanan, **jangan simpan, post, atau lanjutkan transaksi jika nilainya berubah dari input Anda**.'
            : '';
        return {
            answer: `Detail Anda menunjukkan hasil yang berbeda dari harapan dan dilaporkan berulang. Ini layak ditinjau sebagai **dugaan bug**, bukan bug terkonfirmasi; saya belum mereproduksinya secara independen.${warning}\n\nLangkah berikutnya: review oleh tim support. Pada chat web terverifikasi, laporan yang tersimpan dapat memicu notifikasi Telegram support jika fitur aktif. Notifikasi hanya memuat kategori dan referensi laporan, bukan isi chat atau data transaksi; status pengiriman ditampilkan terpisah.`,
            citations: [],
            disposition: 'ESCALATE',
            needsClarification: false,
            safety: { allowed: true },
        };
    }
    const relevant = searchResults
        .filter((article) =>
            isRelevantTroubleshootingArticle(question, article),
        )
        .slice(0, 3);

    if (relevant.length === 0) {
        return {
            answer: reproductionRequest(question, {
                acknowledgeInsufficientEvidence: true,
                details,
            }),
            citations: [],
            citedArticles: [],
            needsClarification: true,
            disposition: 'NEEDS_CLARIFICATION',
            confidence: 0.2,
            safety: { allowed: true },
        };
    }

    const citedArticles: CitedArticleForResponse[] = relevant.map(
        (article) => ({
            slug: article.slug,
            title: article.title,
            summary: article.summary.slice(0, 120),
            modules: article.modules,
        }),
    );
    const articleLines = relevant
        .map(
            (article, index) =>
                `${index + 1}. **[${article.title}](/support/${article.slug})** — ${article.summary}`,
        )
        .join('\n');

    return {
        answer: `Saya menemukan panduan yang relevan berikut:\n\n${articleLines}\n\nPanduan tersebut menjelaskan langkah yang didokumentasikan, tetapi **bukan diagnosis terverifikasi** atas keadaan form di perangkat Anda. ${reproductionRequest(question, { details })}`,
        citations: ['kb:troubleshooting'],
        citedArticles,
        needsClarification: true,
        disposition: 'NEEDS_CLARIFICATION',
        confidence: 0.45,
        safety: { allowed: true },
    };
}
