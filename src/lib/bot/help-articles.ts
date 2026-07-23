import { getMainPrisma } from '@/lib/core/prisma';
import { Prisma } from '@prisma/client';

export interface ListPublishedArticlesParams {
  module?: string;
  tag?: string;
  q?: string;
  errorCode?: string;
  limit?: number;
}

export async function listPublishedArticles(params: ListPublishedArticlesParams = {}) {
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
  const mainDb = getMainPrisma();
  const q = query.trim();
  if (!q) return [];

  // Build keyword search — split into words for broader match
  const words = q.split(/\s+/).filter((w) => w.length > 2);
  const searchConditions: Prisma.HelpArticleWhereInput[] = [];

  // Full query match
  searchConditions.push({ title: { contains: q, mode: 'insensitive' } });
  searchConditions.push({ summary: { contains: q, mode: 'insensitive' } });
  searchConditions.push({ bodyMd: { contains: q, mode: 'insensitive' } });
  searchConditions.push({ tags: { has: q.toLowerCase() } });

  // Individual word match for longer queries
  if (words.length > 1) {
    for (const word of words.slice(0, 3)) {
      searchConditions.push({ title: { contains: word, mode: 'insensitive' } });
      searchConditions.push({ tags: { has: word.toLowerCase() } });
    }
  }

  const where: Prisma.HelpArticleWhereInput = {
    status: 'PUBLISHED',
    OR: searchConditions,
  };

  if (module) {
    where.modules = { has: module };
  }

  const articles = await mainDb.helpArticle.findMany({
    where,
    orderBy: [{ helpfulCount: 'desc' }, { publishedAt: 'desc' }],
    take: limit,
    select: {
      title: true,
      slug: true,
      summary: true,
      modules: true,
      tags: true,
      bodyMd: true,
      helpfulCount: true,
    },
  });

  // Simple relevance scoring: exact title match > tag match > body match
  const scored = articles.map((a) => {
    let score = 0;
    const lowerTitle = a.title.toLowerCase();
    const lowerQ = q.toLowerCase();

    if (lowerTitle === lowerQ) score += 100;
    if (lowerTitle.includes(lowerQ)) score += 50;
    if (a.tags.some((t) => t.includes(lowerQ))) score += 30;
    if (a.summary.toLowerCase().includes(lowerQ)) score += 20;
    score += Math.min(a.helpfulCount, 10);

    return {
      title: a.title,
      slug: a.slug,
      summary: a.summary,
      modules: a.modules,
      tags: a.tags,
      bodyExcerpt: a.bodyMd.slice(0, 300),
      helpfulCount: a.helpfulCount,
      _score: score,
    };
  });

  scored.sort((a, b) => b._score - a._score);

  return scored.map(({ _score: _, ...rest }) => rest);
}
