import type { ConversationMessage } from './conversation-service';

/** Reproduction data stays in the authorized conversation, never in Telegram. */
const FIELD_LABELS = {
    page: 'halaman',
    field: 'field|kolom',
    input: 'input',
    expected: 'harapan|hasil diharapkan',
    actual: 'aktual|hasil aktual',
    steps: 'langkah',
    repeated: 'berulang',
} as const;
type ReproductionField = keyof typeof FIELD_LABELS;
export type BugReproduction = Partial<Record<ReproductionField, string>>;

export const REPRODUCTION_LABELS: Record<ReproductionField, string> = {
    page: 'Halaman',
    field: 'Field',
    input: 'Input',
    expected: 'Harapan',
    actual: 'Aktual',
    steps: 'Langkah',
    repeated: 'Berulang',
};

export function parseReproduction(question: string): BugReproduction {
    const result: BugReproduction = {};
    for (const [field, label] of Object.entries(FIELD_LABELS)) {
        const match = question.match(
            new RegExp(
                `^[ \\t]*(?:[-*][ \\t]+)?(?:${label})[ \\t]*:[ \\t]*([^\\n]*)`,
                'im',
            ),
        );
        if (!match) continue;
        const value = match[1].trim();
        // Explicitly unknown corrections must clear stale data from earlier turns.
        result[field as ReproductionField] =
            value &&
            !/^(?:-|\?|belum tahu|tidak tahu|tidak ada|n\/a)$/i.test(value)
                ? value
                : undefined;
    }
    return result;
}

/** Only continue the immediately preceding troubleshooting protocol. A new
 * page/field starts a new report, rather than inheriting another issue's facts. */
export function collectReproduction(
    question: string,
    history: ConversationMessage[],
): { details: BugReproduction; continuation: boolean } {
    const current = parseReproduction(question);
    const last = history.at(-1);
    if (
        !last ||
        last.role !== 'assistant' ||
        !last.content.includes('Detail reproduksi yang masih diperlukan:')
    ) {
        return { details: current, continuation: false };
    }
    const turns: BugReproduction[] = [];
    for (let i = history.length - 2; i >= 0; i -= 2) {
        const user = history[i];
        if (user?.role !== 'user') break;
        turns.unshift(parseReproduction(user.content));
        if (
            i === 0 ||
            history[i - 1].role !== 'assistant' ||
            !history[i - 1].content.includes(
                'Detail reproduksi yang masih diperlukan:',
            )
        )
            break;
    }
    const changesIssue = (next: BugReproduction, previous: BugReproduction) =>
        (['page', 'field'] as const).some(
            (key) =>
                next[key] &&
                previous[key] &&
                next[key].toLowerCase() !== previous[key].toLowerCase(),
        );
    // Reset at every issue boundary, including earlier turns in this window.
    const previous = turns.reduce<BugReproduction>(
        (details, turn) =>
            changesIssue(turn, details) ? turn : { ...details, ...turn },
        {},
    );
    const changed = changesIssue(current, previous);
    // Free-form unrelated turns must return to the normal assistant flow.
    const continuation = Object.keys(current).length > 0;
    return {
        details:
            continuation && !changed ? { ...previous, ...current } : current,
        continuation,
    };
}

export function missingReproductionFields(
    details: BugReproduction,
): ReproductionField[] {
    return (Object.keys(FIELD_LABELS) as ReproductionField[]).filter(
        (key) => !details[key],
    );
}

export function isReproducibleBugCandidate(details: BugReproduction): boolean {
    if (missingReproductionFields(details).length > 0) return false;
    const repeatCount = details.repeated!.match(/^(\d+)\s*kali\b/i);
    const repeated =
        !/\b(?:tidak|belum|kadang|sekali)\b/i.test(details.repeated!) &&
        (/^(?:ya|iya|selalu|konsisten|setiap kali)\b/i.test(
            details.repeated!,
        ) ||
            (repeatCount !== null && Number(repeatCount[1]) >= 2));
    const hasSteps =
        details.steps!.length >= 15 &&
        /(?:→|->|\blalu\b|\bkemudian\b|\bsetelah\b|\b2[.)])/i.test(
            details.steps!,
        );
    // Business rules, access denials, and client connectivity need investigation,
    // not an automatic software-defect classification.
    const normalBlocker =
        /\b(akses|permission|hak akses|izin|stok kurang|stok tidak cukup|saldo tidak cukup|belum (?:approve|disetujui|dibayar)|wajib diisi|internet|offline|koneksi)\b/i;
    return (
        repeated &&
        hasSteps &&
        details.expected!.toLowerCase() !== details.actual!.toLowerCase() &&
        !normalBlocker.test(`${details.expected} ${details.actual}`)
    );
}
