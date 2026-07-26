import type { ToolEvidence } from './assistant-types';

/**
 * Detect ambiguous questions that need clarification.
 * Returns clarification suggestions when the question lacks specificity.
 */

const AMBIGUOUS_PATTERNS = [
    {
        pattern:
            /^(cek|lihat|tampil(?:kan)?)\s+(stok|barang|pesanan|order|invoice|spk|po)\s*$/i,
        category: 'no-entity',
    },
    {
        pattern:
            /\b(berapa|ada berapa|sisa)\b.*\b(stok|barang|qty|kuantitas)\b.*$/i,
        category: 'which-location',
    },
    { pattern: /\b(budi|andi|siti|ahmad|agus)\b/i, category: 'ambiguous-name' },
    {
        pattern: /^(itu|yang\s+tadi|yang\s+sebelumnya|yang\s+ini)$/i,
        category: 'pronoun-reference',
    },
    {
        pattern: /^(kenapa|kok|gimana|gimana\s+cara)\s*$/i,
        category: 'incomplete-question',
    },
    {
        pattern:
            /\b(error|gagal|tidak\s+bisa|nggak\s+bisa)\b(?!\s+(karena|dikarenakan))/i,
        category: 'no-context',
    },
];

const LOCATION_CLARIFICATIONS = [
    'Gudang Utama',
    'Gudang Reject',
    'Gudang Bahan Baku',
    'Gudang Jadi',
];

export type ClarificationResult = {
    needsClarification: boolean;
    category?: string;
    suggestions?: string[];
    clarificationPrompt?: string;
};

/**
 * Analyze a question and tool results to determine if clarification is needed.
 */
export function analyzeForClarification(
    question: string,
    toolResults: ToolEvidence[],
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
): ClarificationResult {
    const q = question.trim().toLowerCase();

    // Check if question is too short or vague
    if (q.length < 5) {
        return {
            needsClarification: true,
            category: 'too-short',
            suggestions: ['Bisa jelaskan lebih detail pertanyaan Anda?'],
            clarificationPrompt: 'Bisa jelaskan lebih detail pertanyaan Anda?',
        };
    }

    // Check pronoun references — if question contains "itu", "yang tadi" without context
    const hasPronoun =
        /^(itu|yang\s+tadi|yang\s+sebelumnya|kenapa\s+belum|kenapa\s+kok|kok\s+belum)/i.test(
            q,
        );
    if (hasPronoun && history.length === 0) {
        return {
            needsClarification: true,
            category: 'pronoun-reference',
            suggestions: [
                'Maksudnya yang mana? Bisa sebutkan nomor atau nama?',
            ],
            clarificationPrompt:
                'Bisa sebutkan nomor atau nama yang Anda maksud?',
        };
    }

    // Check if multiple results returned (ambiguous entity)
    for (const result of toolResults) {
        if (result.entities && result.entities.length > 1) {
            const entityType = result.entities[0]?.type;
            return {
                needsClarification: true,
                category: 'multiple-results',
                suggestions: result.entities.map((e) => e.label),
                clarificationPrompt: `Saya menemukan beberapa ${entityType}. Yang mana yang Anda maksud?`,
            };
        }
    }

    // Check if tool returned no results + question is vague
    const noResults = toolResults.every(
        (r) => r.completeness === 'partial' && r.facts.length === 0,
    );
    if (noResults && q.length < 30) {
        return {
            needsClarification: true,
            category: 'no-results-vague',
            suggestions: [
                'Coba sebutkan nomor transaksi atau nama yang lebih spesifik',
                'Atau jelaskan modul/area mana yang ingin dicek',
            ],
            clarificationPrompt:
                'Data tidak ditemukan. Bisa sebutkan nomor atau nama yang lebih spesifik?',
        };
    }

    // Check for ambiguous patterns
    for (const { pattern, category } of AMBIGUOUS_PATTERNS) {
        if (pattern.test(q)) {
            return {
                needsClarification: true,
                category,
                suggestions: getSuggestionsForCategory(category),
                clarificationPrompt: getPromptForCategory(category),
            };
        }
    }

    return { needsClarification: false };
}

function getSuggestionsForCategory(category: string): string[] {
    switch (category) {
        case 'no-entity':
            return [
                'Sebutkan nama barang atau nomor transaksi',
                'Sebutkan lokasi gudang jika ingin cek stok',
            ];
        case 'which-location':
            return LOCATION_CLARIFICATIONS;
        case 'ambiguous-name':
            return [
                'Sebutkan nomor transaksi',
                'Sebutkan context: customer, order, atau produk?',
            ];
        case 'pronoun-reference':
            return ['Sebutkan nomor atau nama yang Anda maksud'];
        case 'incomplete-question':
            return [
                'Jelaskan masalah yang Anda hadapi',
                'Sebutkan modul atau menu terkait',
            ];
        case 'no-context':
            return ['Apa error yang muncul?', 'Di halaman mana Anda berada?'];
        default:
            return ['Bisa jelaskan lebih detail?'];
    }
}

function getPromptForCategory(category: string): string {
    switch (category) {
        case 'no-entity':
            return 'Bisa sebutkan nama barang atau nomor transaksi yang ingin dicek?';
        case 'which-location':
            return 'Stok di lokasi gudang mana yang ingin dicek?';
        case 'ambiguous-name':
            return 'Nama tersebut bisa merujuk ke beberapa data. Bisa sebutkan nomor transaksinya?';
        case 'pronoun-reference':
            return 'Maksudnya yang mana? Bisa sebutkan nomor atau nama?';
        case 'incomplete-question':
            return 'Bisa jelaskan pertanyaan Anda lebih lengkap?';
        case 'no-context':
            return 'Bisa jelaskan error atau kendala yang Anda alami?';
        default:
            return 'Bisa jelaskan lebih detail?';
    }
}

/**
 * Resolve pronouns in follow-up messages using conversation context.
 * Replaces "itu", "yang tadi", "kenapa belum" with resolved entity references.
 */
export function resolvePronouns(
    question: string,
    resolvedEntities: Map<string, { type: string; id: string; label: string }>,
): { resolved: string; wasPronoun: boolean } {
    const q = question.trim();
    const pronounPattern =
        /^(itu|yang\s+tadi|yang\s+sebelumnya|kenapa\s+belum|kenapa\s+kok|kok\s+belum)\s*(.*)/i;

    const match = q.match(pronounPattern);
    if (!match || resolvedEntities.size === 0) {
        return { resolved: q, wasPronoun: false };
    }

    // Get the most recently resolved entity
    const lastEntry = Array.from(resolvedEntities.values()).pop();
    if (!lastEntry) {
        return { resolved: q, wasPronoun: false };
    }

    const suffix = match[2] || '';
    const resolved = `${lastEntry.type} ${lastEntry.id} ${suffix}`.trim();

    return { resolved, wasPronoun: true };
}

/**
 * Calculate confidence score based on evidence.
 */
export function calculateConfidence(
    toolResults: ToolEvidence[],
    hasClarification: boolean,
): number {
    if (hasClarification) return 0.3;

    let score = 0.5; // base

    for (const result of toolResults) {
        if (result.completeness === 'complete') score += 0.15;
        if (result.entities && result.entities.length > 0) score += 0.1;
        if (result.facts.length > 0) score += 0.05;
    }

    return Math.min(score, 1.0);
}
