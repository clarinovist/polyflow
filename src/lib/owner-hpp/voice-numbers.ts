/**
 * Reads the numbers an Indonesian speaker (or Whisper) wrote in a transcript:
 * "14.500", "Rp 15.250", "2,5%", "500 ribu", "1,2 juta", "tiga persen",
 * "seratus dua puluh", "empat belas ribu lima ratus", "dua koma lima".
 *
 * Dots group thousands, a comma is the decimal separator. A lone dotted group
 * ("14.500", "1.250") is ambiguous, so both readings are returned. Scaled
 * variants (x1000) are never invented: the result is the allow-list the
 * cross-check holds model output against.
 */

const PRECISION_DIGITS = 12;
const THOUSAND = 1_000;
const MILLION = 1_000_000;
const BILLION = 1_000_000_000;
const TEN = 10;
const HUNDRED = 100;

const SCALE_WORDS: Readonly<Record<string, number>> = {
    ribu: THOUSAND,
    juta: MILLION,
    miliar: BILLION,
    milyar: BILLION,
};
/** Short forms only count right after a digit literal ("500 rb"). */
const SHORT_SCALE_WORDS: Readonly<Record<string, number>> = {
    rb: THOUSAND,
    jt: MILLION,
};
const DIGIT_WORDS: Readonly<Record<string, number>> = {
    nol: 0,
    satu: 1,
    dua: 2,
    tiga: 3,
    empat: 4,
    lima: 5,
    enam: 6,
    tujuh: 7,
    delapan: 8,
    sembilan: 9,
};
/** "se-" forms are a complete number on their own. */
const FIXED_WORDS: Readonly<Record<string, number>> = {
    sepuluh: TEN,
    sebelas: 11,
    seratus: HUNDRED,
    seribu: THOUSAND,
    sejuta: MILLION,
};
const STRUCTURE_WORDS: ReadonlySet<string> = new Set([
    'belas',
    'puluh',
    'ratus',
    'koma',
]);

const TOKEN_PATTERN = /\d+(?:[.,]\d+)*|[a-z]+/g;
const PLAIN_DIGITS = /^\d+$/;
const THOUSANDS_GROUPED = /^[1-9]\d{0,2}(?:\.\d{3})+(?:,\d+)?$/;
const SINGLE_GROUP = /^[1-9]\d{0,2}\.\d{3}$/;
const COMMA_DECIMAL = /^\d+,\d+$/;
const DOT_DECIMAL = /^\d+\.\d+$/;
const SHORT_FOLLOWER = /^\d{1,3}$/;

/** Rounds away float noise so 1.2 * 1_000_000 compares equal to 1200000. */
export function normalizeNumber(value: number): number {
    return Number(value.toPrecision(PRECISION_DIGITS));
}

interface Token {
    isNumber: boolean;
    text: string;
}

function tokenize(transcript: string): Token[] {
    const matches = transcript.toLowerCase().match(TOKEN_PATTERN) ?? [];
    return matches.map((text) => ({ isNumber: /^\d/.test(text), text }));
}

/** Candidate values of one digit literal; empty when it is not a number. */
function parseLiteral(text: string): number[] {
    if (PLAIN_DIGITS.test(text)) return [Number(text)];
    if (THOUSANDS_GROUPED.test(text)) {
        const grouped = Number(text.replace(/\./g, '').replace(',', '.'));
        if (!SINGLE_GROUP.test(text)) return [grouped];
        return [grouped, Number(text)];
    }
    if (COMMA_DECIMAL.test(text)) return [Number(text.replace(',', '.'))];
    if (DOT_DECIMAL.test(text)) return [Number(text)];
    return [];
}

function isNumberWord(word: string): boolean {
    return (
        word in DIGIT_WORDS ||
        word in FIXED_WORDS ||
        word in SCALE_WORDS ||
        STRUCTURE_WORDS.has(word)
    );
}

function startsNumberWord(word: string): boolean {
    return word in DIGIT_WORDS || word in FIXED_WORDS;
}

interface WordState {
    total: number;
    group: number;
    pending: number;
    hasPending: boolean;
    hasAny: boolean;
}

const EMPTY_STATE: WordState = {
    total: 0,
    group: 0,
    pending: 0,
    hasPending: false,
    hasAny: false,
};

function stateValue(state: WordState): number {
    return state.total + state.group + state.pending;
}

function applyWord(state: WordState, word: string): WordState {
    if (word in DIGIT_WORDS) {
        return {
            ...state,
            pending: DIGIT_WORDS[word],
            hasPending: true,
            hasAny: true,
        };
    }
    if (word in FIXED_WORDS) {
        const value = FIXED_WORDS[word];
        const isScaleLike = value >= THOUSAND;
        return isScaleLike
            ? { ...state, total: state.total + value, hasAny: true }
            : { ...state, group: state.group + value, hasAny: true };
    }
    if (!state.hasPending) return state;
    if (word === 'belas') {
        return {
            ...state,
            group: state.group + TEN + state.pending,
            pending: 0,
            hasPending: false,
        };
    }
    const multiplier = word === 'puluh' ? TEN : HUNDRED;
    return {
        ...state,
        group: state.group + state.pending * multiplier,
        pending: 0,
        hasPending: false,
    };
}

function applyScale(state: WordState, scale: number): WordState {
    const value = state.group + state.pending;
    if (!state.hasAny || value === 0) return state;
    return {
        ...state,
        total: state.total + value * scale,
        group: 0,
        pending: 0,
        hasPending: false,
    };
}

/** Digits spoken after "koma" ("dua koma dua lima" -> 25). */
function readDecimalDigits(
    words: readonly string[],
    from: number,
): { digits: string; next: number } {
    let digits = '';
    let next = from;
    while (next < words.length && words[next] in DIGIT_WORDS) {
        digits += String(DIGIT_WORDS[words[next]]);
        next += 1;
    }
    return { digits, next };
}

function parseWordRun(words: readonly string[]): number[] {
    const results: number[] = [];
    let state = EMPTY_STATE;
    const flush = () => {
        if (state.hasAny) results.push(stateValue(state));
        state = EMPTY_STATE;
    };

    let index = 0;
    while (index < words.length) {
        const word = words[index];
        if (word === 'koma') {
            const { digits, next } = readDecimalDigits(words, index + 1);
            if (state.hasAny && digits) {
                const whole = stateValue(state) + Number(`0.${digits}`);
                const scale = SCALE_WORDS[words[next]];
                results.push(scale ? whole * scale : whole);
                state = EMPTY_STATE;
                index = scale ? next + 1 : next;
                continue;
            }
            index += 1;
            continue;
        }
        if (word in SCALE_WORDS) {
            state = applyScale(state, SCALE_WORDS[word]);
            index += 1;
            continue;
        }
        if (word in DIGIT_WORDS && state.hasPending) flush();
        state = applyWord(state, word);
        index += 1;
    }
    flush();
    return results;
}

function collectWordRun(
    tokens: readonly Token[],
    from: number,
): { words: string[]; next: number } {
    const words: string[] = [];
    let next = from;
    while (
        next < tokens.length &&
        !tokens[next].isNumber &&
        isNumberWord(tokens[next].text)
    ) {
        words.push(tokens[next].text);
        next += 1;
    }
    return { words, next };
}

function scaleOf(token: Token | undefined): number | undefined {
    if (!token || token.isNumber) return undefined;
    return SCALE_WORDS[token.text] ?? SHORT_SCALE_WORDS[token.text];
}

/** "2 koma 5" -> 2.5 when both sides are plain digits. */
function spokenDecimal(
    tokens: readonly Token[],
    index: number,
): { value: number; next: number } | null {
    const [whole, marker, fraction] = tokens.slice(index, index + 3);
    if (!PLAIN_DIGITS.test(whole.text) || marker?.text !== 'koma') return null;
    if (!fraction?.isNumber || !PLAIN_DIGITS.test(fraction.text)) return null;
    return { value: Number(`${whole.text}.${fraction.text}`), next: index + 3 };
}

function readNumberLiteral(
    tokens: readonly Token[],
    index: number,
): { values: number[]; next: number } {
    const decimal = spokenDecimal(tokens, index);
    const literal = decimal
        ? { values: [decimal.value], next: decimal.next }
        : { values: parseLiteral(tokens[index].text), next: index + 1 };
    const scale = scaleOf(tokens[literal.next]);
    if (!scale) return literal;

    const scaled = literal.values.map((value) => value * scale);
    const follower = tokens[literal.next + 1];
    const isCompound =
        scale >= THOUSAND &&
        follower?.isNumber &&
        SHORT_FOLLOWER.test(follower.text);
    return {
        values: isCompound
            ? [
                  ...scaled,
                  ...scaled.map((value) => value + Number(follower.text)),
              ]
            : scaled,
        next: literal.next + 1,
    };
}

/** Every number the transcript says, de-duplicated, in order of appearance. */
export function extractNumbers(transcript: string): number[] {
    const tokens = tokenize(transcript);
    const found: number[] = [];
    let index = 0;
    while (index < tokens.length) {
        const token = tokens[index];
        if (token.isNumber) {
            const read = readNumberLiteral(tokens, index);
            found.push(...read.values);
            index = read.next;
            continue;
        }
        if (!startsNumberWord(token.text)) {
            index += 1;
            continue;
        }
        const run = collectWordRun(tokens, index);
        found.push(...parseWordRun(run.words));
        index = run.next;
    }
    return [...new Set(found.map(normalizeNumber))];
}

/** Tolerance zero: the value must equal a spoken number exactly. */
export function isSpokenNumber(
    value: number,
    spoken: readonly number[],
): boolean {
    return spoken.includes(normalizeNumber(value));
}
