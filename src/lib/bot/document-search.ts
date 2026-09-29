import { Prisma } from '@prisma/client';

// Recognize only complete document identifiers, never numbers embedded in prose.
const DOCUMENT = /^(?:(PO|SO|DO|SJ|INV|BILL|GR|SR|PR|RET)\s+)?(PO|SO|DO|SJ|INV|BILL|GR|SR|PR|RET)-(\d{4})-(\d{1,10})$/i;
export function canonicalDocument(raw: string): string | null {
    const compact = raw.trim().replace(/[\u2010-\u2015\u2212\uFE63\uFF0D]/g, '-').replace(/\s*-\s*/g, '-');
    const match = compact.match(DOCUMENT);
    if (!match || (match[1] && match[1].toUpperCase() !== match[2].toUpperCase())) return null;
    return `${match[2]}-${match[3]}-${match[4]}`;
}

/** Bounded, literal candidates. Do not drop prefix/year: that can select another document. */
export function normalizeDocumentSearch(raw: string): string[] {
    const trimmed = raw.trim();
    const canonical = canonicalDocument(trimmed);
    if (!canonical) return [trimmed];
    const delimiters = trimmed.replace(/[\u2010-\u2015\u2212\uFE63\uFF0D]/g, '-').replace(/\s*-\s*/g, '-');
    return [...new Set([trimmed, delimiters, canonical])];
}

export function escapeDocumentLike(value: string): string {
    return value.replace(/[\\%_]/g, '\\$&');
}

/** column must be a static Prisma.sql identifier from code, never model/user input. */
export function documentNumberPredicate(column: Prisma.Sql, raw: string): Prisma.Sql {
    const predicates = normalizeDocumentSearch(raw).map(candidate =>
        Prisma.sql`${column} ILIKE ${'%' + escapeDocumentLike(candidate) + '%'}`);
    if (canonicalDocument(raw)) predicates.push(normalizedDocumentPredicate(column, raw));
    return Prisma.join(predicates, ' OR ');
}

/** Legacy stored numbers can also contain spaces/unicode dashes; never rewrite data. */
export function normalizedDocumentPredicate(column: Prisma.Sql, raw: string): Prisma.Sql {
    const canonical = canonicalDocument(raw);
    if (!canonical) return Prisma.sql`FALSE`;
    return Prisma.sql`upper(regexp_replace(translate(${column}, ${'‐‑‒–—―−﹣－'}, ${'---------'}), ${'[[:space:]]+'}, ${''}, ${'g'})) = ${canonical.toUpperCase()}`;
}

export type DocumentSearchMeta = {
    searchTerm: string | null;
    candidates: string[];
    matchCount: number | null;
    matchCountScope: 'returned' | 'total' | 'unknown';
};

/** No free text, names, facts, entity labels, or arbitrary tool arguments enter the audit. */
export function documentSearchMeta(
    raw: unknown, matchCount: number | null,
    scope: DocumentSearchMeta['matchCountScope'] = 'returned',
): DocumentSearchMeta {
    const safe = typeof raw === 'string' && raw.length <= 120 && canonicalDocument(raw) !== null;
    return {
        searchTerm: safe ? raw : null,
        candidates: safe ? normalizeDocumentSearch(raw) : [],
        matchCount,
        matchCountScope: matchCount === null ? 'unknown' : scope,
    };
}
