/**
 * Heading-anchor utilities for the docs-portal "on this page" TOC.
 *
 * `article-renderer.tsx` sets these same ids on the rendered `<h2>`
 * elements, and `docs-toc.tsx` links to them via `#id`. Both call
 * `createHeadingIdSequencer()` and feed it headings in document order so
 * duplicate heading text resolves to the same de-duplicated id in both
 * places — do not compute ids independently in more than one spot, or the
 * TOC and the rendered anchors can drift apart.
 */

/**
 * Turn heading text into a URL-safe anchor id: lowercase, accents
 * stripped, non-alphanumeric runs collapsed to a single dash, leading/
 * trailing dashes trimmed.
 */
export function slugifyHeading(text: string): string {
    return text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/**
 * Returns a function that slugifies heading text and de-dupes repeated
 * slugs within one document by suffixing `-2`, `-3`, ... on repeats, so
 * two `## Catatan` headings in the same article don't collide on one
 * anchor id.
 */
export function createHeadingIdSequencer() {
    const counts = new Map<string, number>();
    return (text: string): string => {
        const base = slugifyHeading(text);
        const count = (counts.get(base) ?? 0) + 1;
        counts.set(base, count);
        return count === 1 ? base : `${base}-${count}`;
    };
}

export interface ArticleHeading {
    id: string;
    text: string;
}

/**
 * Find `## ` headings (same H2-only rule as `ArticleBodyRenderer`) in
 * document order and return them with de-duplicated anchor ids.
 *
 * Lines inside ``` code fences are skipped, matching `ArticleBodyRenderer`
 * — a `## ` line inside a code block never becomes a rendered <h2>, so it
 * must not become a TOC entry either (dead anchor otherwise).
 */
export function extractHeadings(bodyMd: string): ArticleHeading[] {
    const nextId = createHeadingIdSequencer();
    const headings: ArticleHeading[] = [];
    let inCodeBlock = false;

    for (const line of bodyMd.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('```')) {
            inCodeBlock = !inCodeBlock;
            continue;
        }
        if (inCodeBlock) continue;
        if (!trimmed.startsWith('## ')) continue;
        const text = trimmed.slice(3).trim();
        headings.push({ id: nextId(text), text });
    }

    return headings;
}
