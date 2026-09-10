import type {
    AssistantResponse,
    CitedArticleForResponse,
} from './assistant-types';
import type { HelpSearchResult } from './help-articles';

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
    options: { acknowledgeInsufficientEvidence?: boolean } = {},
): string {
    const safetyWarning = CRITICAL_TRANSACTION_PATTERN.test(question)
        ? '\n\nUntuk keamanan transaksi, **jangan simpan, post, atau lanjutkan transaksi jika nominal/nilai yang tampil berubah dari input Anda**.'
        : '';

    const evidenceLimit = options.acknowledgeInsufficientEvidence
        ? 'Saya belum dapat memastikan penyebabnya dari data yang tersedia, karena saya tidak dapat melihat keadaan form di perangkat Anda. '
        : '';

    return `${evidenceLimit}Saya tidak akan menebak menu atau format, maupun menyimpulkan status bug tanpa bukti.${safetyWarning}\n\nAgar kendalanya bisa direproduksi, mohon kirim:\n- nama halaman dan field yang bermasalah;\n- input persis yang diketik;\n- hasil yang tampil setelah input;\n- pesan error (jika ada);\n- langkah-langkah sejak halaman dibuka sampai masalah terjadi;\n- browser/perangkat bila masalahnya hanya terjadi di perangkat tertentu.\n\nSetelah itu saya bisa mencocokkannya dengan panduan yang tersedia. Jika tetap tidak cocok, teruskan detail reproduksi tersebut kepada admin/support Polyflow melalui kanal dukungan yang biasa digunakan perusahaan Anda.`;
}

export function buildTroubleshootingResponse(
    question: string,
    searchResults: HelpSearchResult[],
): AssistantResponse {
    const relevant = searchResults
        .filter((article) =>
            isRelevantTroubleshootingArticle(question, article),
        )
        .slice(0, 3);

    if (relevant.length === 0) {
        return {
            answer: reproductionRequest(question, {
                acknowledgeInsufficientEvidence: true,
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
        answer: `Saya menemukan panduan yang relevan berikut:\n\n${articleLines}\n\nPanduan tersebut menjelaskan langkah yang didokumentasikan, tetapi **bukan diagnosis terverifikasi** atas keadaan form di perangkat Anda. ${reproductionRequest(question)}`,
        citations: ['kb:troubleshooting'],
        citedArticles,
        needsClarification: true,
        disposition: 'NEEDS_CLARIFICATION',
        confidence: 0.45,
        safety: { allowed: true },
    };
}
