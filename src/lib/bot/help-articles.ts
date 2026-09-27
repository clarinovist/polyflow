import { getMainPrisma } from '@/lib/core/prisma';
import { Prisma } from '@prisma/client';
import { helpSearchTerms } from './help-search-terms';
import type { NavArticleItem } from '@/lib/bot/help-article-shared';
export {
    isTroubleshootArticle,
    type NavArticleItem,
} from '@/lib/bot/help-article-shared';

export interface ListPublishedArticlesParams {
    module?: string;
    tag?: string;
    q?: string;
    errorCode?: string;
    limit?: number;
}

export async function listPublishedArticles(
    params: ListPublishedArticlesParams = {},
) {
    const mainDb = getMainPrisma();
    const { module, tag, q, errorCode, limit = 50 } = params;

    const where: Prisma.HelpArticleWhereInput = {
        status: 'PUBLISHED',
    };

    if (module) where.modules = { has: module };
    if (tag) where.tags = { has: tag };
    if (errorCode) where.errorCodes = { has: errorCode };
    if (q) {
        where.OR = [
            { title: { contains: q, mode: 'insensitive' } },
            { summary: { contains: q, mode: 'insensitive' } },
            { tags: { has: q.toLowerCase() } },
        ];
    }

    const articles = await mainDb.helpArticle.findMany({
        where,
        orderBy: [{ helpfulCount: 'desc' }, { publishedAt: 'desc' }],
        take: limit,
        select: {
            id: true,
            slug: true,
            title: true,
            summary: true,
            modules: true,
            tags: true,
            errorCodes: true,
            helpfulCount: true,
            notHelpfulCount: true,
            publishedAt: true,
        },
    });

    return articles;
}

/**
 * Slim, unlimited(-ish) fetch of every published article for the docs
 * sidebar nav tree. Deliberately separate from `listPublishedArticles`
 * (capped at 30, used by the search+filter card grid) — the nav tree
 * needs the full set to build a complete module-grouped tree, not just a
 * search page of results.
 */
export async function listAllPublishedArticlesForNav(): Promise<
    NavArticleItem[]
> {
    const mainDb = getMainPrisma();

    const articles = await mainDb.helpArticle.findMany({
        where: { status: 'PUBLISHED' },
        orderBy: [{ title: 'asc' }],
        take: 500,
        select: {
            slug: true,
            title: true,
            modules: true,
            tags: true,
            errorCodes: true,
        },
    });

    return articles;
}

export async function getPublishedArticleBySlug(slug: string) {
    const mainDb = getMainPrisma();

    const article = await mainDb.helpArticle.findFirst({
        where: {
            slug,
            status: 'PUBLISHED',
        },
    });

    return article;
}

// ─── SEARCH FOR VIRTUAL CS TOOL ───────────────────

export interface HelpSearchResult {
    title: string;
    slug: string;
    summary: string;
    modules: string[];
    tags: string[];
    bodyExcerpt: string;
    helpfulCount: number;
}

export async function searchHelpArticles(
    query: string,
    module?: string,
    limit = 5,
): Promise<HelpSearchResult[]> {
    const terms = helpSearchTerms(query);
    if (!terms.length || !Number.isFinite(limit) || limit <= 0) return [];
    const maxResults = Math.min(Math.floor(limit), 10);
    // Rank in PostgreSQL BEFORE LIMIT. Parameters are bound by Prisma; only
    // published global articles may enter evidence, never tenant knowledge.
    const scores = terms.map((group) => {
        const patterns = group.map((term) => `%${term}%`);
        return Prisma.sql`CASE
            WHEN (${Prisma.join(
                patterns.map((p) => Prisma.sql`title ILIKE ${p}`),
                ' OR ',
            )}) THEN 8
            WHEN (${Prisma.join(
                patterns.map(
                    (p) => Prisma.sql`array_to_string(tags, ' ') ILIKE ${p}`,
                ),
                ' OR ',
            )}) THEN 6
            WHEN (${Prisma.join(
                patterns.map((p) => Prisma.sql`summary ILIKE ${p}`),
                ' OR ',
            )}) THEN 3
            WHEN (${Prisma.join(
                patterns.map((p) => Prisma.sql`"bodyMd" ILIKE ${p}`),
                ' OR ',
            )}) THEN 1
            ELSE 0 END`;
    });
    const score = Prisma.sql`(${Prisma.join(scores, ' + ')})`;
    const articles = await getMainPrisma().$queryRaw<
        Array<{
            title: string;
            slug: string;
            summary: string;
            modules: string[];
            tags: string[];
            bodyExcerpt: string;
            helpfulCount: number;
        }>
    >(Prisma.sql`
        SELECT title, slug, summary, modules, tags,
            LEFT("bodyMd", 6000) AS "bodyExcerpt", "helpfulCount"
        FROM "HelpArticle"
        WHERE status = 'PUBLISHED' AND ${score} > 0
            ${module ? Prisma.sql`AND ${module} = ANY(modules)` : Prisma.empty}
        ORDER BY ${score} DESC, "helpfulCount" DESC, "publishedAt" DESC, slug ASC
        LIMIT ${maxResults}
    `);
    return articles;
}
