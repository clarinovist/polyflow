import { prisma } from '@/lib/core/prisma';
import type { TenantKnowledgeArticle, TenantKnowledgeStatus } from '@prisma/client';
import { searchHelpArticles } from './help-articles';
import type { ToolEvidence } from './assistant-types';
import { createEvidence } from './evidence';

const MAX_BODY_LENGTH = 50000;
const MAX_TITLE_LENGTH = 200;
const MAX_SUMMARY_LENGTH = 500;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TenantKnowledgeSearchResult = {
  slug: string;
  title: string;
  summary: string;
  modules: string[];
  tags: string[];
  bodyExcerpt: string;
  sensitivity: string;
  source: 'tenant-kb';
};

// ---------------------------------------------------------------------------
// CRUD Operations (tenant-scoped)
// ---------------------------------------------------------------------------

export async function createTenantKnowledge(input: {
  tenantId: string;
  slug: string;
  title: string;
  summary?: string;
  bodyMd: string;
  modules?: string[];
  tags?: string[];
  sensitivity?: 'INTERNAL' | 'RESTRICTED';
  allowedResources?: string[];
  createdBy?: string;
}): Promise<TenantKnowledgeArticle> {
  return prisma.tenantKnowledgeArticle.create({
    data: {
      tenantId: input.tenantId,
      slug: input.slug,
      title: input.title.slice(0, MAX_TITLE_LENGTH),
      summary: (input.summary ?? '').slice(0, MAX_SUMMARY_LENGTH),
      bodyMd: input.bodyMd.slice(0, MAX_BODY_LENGTH),
      modules: input.modules ?? [],
      tags: input.tags ?? [],
      sensitivity: input.sensitivity ?? 'INTERNAL',
      allowedResources: input.allowedResources ?? [],
      source: 'HUMAN',
      status: 'DRAFT',
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    },
  });
}

export async function updateTenantKnowledge(input: {
  id: string;
  tenantId: string;
  title?: string;
  summary?: string;
  bodyMd?: string;
  modules?: string[];
  tags?: string[];
  sensitivity?: 'INTERNAL' | 'RESTRICTED';
  allowedResources?: string[];
  updatedBy?: string;
}): Promise<TenantKnowledgeArticle> {
  // Verify ownership
  const existing = await prisma.tenantKnowledgeArticle.findFirst({
    where: { id: input.id, tenantId: input.tenantId },
  });
  if (!existing) throw new Error('Article not found');

  return prisma.tenantKnowledgeArticle.update({
    where: { id: input.id },
    data: {
      ...(input.title !== undefined && { title: input.title.slice(0, MAX_TITLE_LENGTH) }),
      ...(input.summary !== undefined && { summary: input.summary.slice(0, MAX_SUMMARY_LENGTH) }),
      ...(input.bodyMd !== undefined && { bodyMd: input.bodyMd.slice(0, MAX_BODY_LENGTH) }),
      ...(input.modules !== undefined && { modules: input.modules }),
      ...(input.tags !== undefined && { tags: input.tags }),
      ...(input.sensitivity !== undefined && { sensitivity: input.sensitivity }),
      ...(input.allowedResources !== undefined && { allowedResources: input.allowedResources }),
      updatedBy: input.updatedBy,
      version: { increment: 1 },
    },
  });
}

export async function publishTenantKnowledge(
  id: string,
  tenantId: string,
  publishedBy?: string,
): Promise<TenantKnowledgeArticle> {
  const existing = await prisma.tenantKnowledgeArticle.findFirst({
    where: { id, tenantId },
  });
  if (!existing) throw new Error('Article not found');

  return prisma.tenantKnowledgeArticle.update({
    where: { id },
    data: {
      status: 'PUBLISHED',
      publishedAt: new Date(),
      updatedBy: publishedBy,
    },
  });
}

export async function archiveTenantKnowledge(
  id: string,
  tenantId: string,
  archivedBy?: string,
): Promise<TenantKnowledgeArticle> {
  const existing = await prisma.tenantKnowledgeArticle.findFirst({
    where: { id, tenantId },
  });
  if (!existing) throw new Error('Article not found');

  return prisma.tenantKnowledgeArticle.update({
    where: { id },
    data: {
      status: 'ARCHIVED',
      updatedBy: archivedBy,
    },
  });
}

export async function listTenantKnowledge(input: {
  tenantId: string;
  status?: TenantKnowledgeStatus;
  module?: string;
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: TenantKnowledgeArticle[]; total: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    tenantId: input.tenantId,
  };

  if (input.status) where.status = input.status;
  if (input.module) where.modules = { has: input.module };
  if (input.q) {
    where.OR = [
      { title: { contains: input.q, mode: 'insensitive' } },
      { summary: { contains: input.q, mode: 'insensitive' } },
      { tags: { has: input.q } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.tenantKnowledgeArticle.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: input.limit ?? 20,
      skip: input.offset ?? 0,
    }),
    prisma.tenantKnowledgeArticle.count({ where }),
  ]);

  return { items, total };
}

// ---------------------------------------------------------------------------
// Retrieval: combined global + tenant knowledge
// ---------------------------------------------------------------------------

export async function searchCombinedKnowledge(
  query: string,
  tenantId: string,
  module?: string,
  limit: number = 5,
): Promise<TenantKnowledgeSearchResult[]> {
  // 1. Search global HelpArticles
  const globalResults = await searchHelpArticles(query, module, limit);

  // 2. Search tenant knowledge (PUBLISHED only, scoped to tenantId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    tenantId,
    status: 'PUBLISHED',
  };

  if (module) where.modules = { has: module };

  // Simple keyword search on title, summary, tags
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  if (words.length > 0) {
    where.OR = words.flatMap((word) => [
      { title: { contains: word, mode: 'insensitive' as const } },
      { summary: { contains: word, mode: 'insensitive' as const } },
      { tags: { has: word } },
    ]);
  }

  const tenantArticles = await prisma.tenantKnowledgeArticle.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: limit,
  });

  // 3. Merge and deduplicate
  const results: TenantKnowledgeSearchResult[] = [];

  // Add tenant articles first (higher priority for tenant context)
  for (const article of tenantArticles) {
    results.push({
      slug: article.slug,
      title: article.title,
      summary: article.summary,
      modules: article.modules,
      tags: article.tags,
      bodyExcerpt: article.bodyMd.slice(0, 300),
      sensitivity: article.sensitivity,
      source: 'tenant-kb',
    });
  }

  // Add global articles
  for (const article of globalResults) {
    if (!results.some((r) => r.slug === article.slug)) {
      results.push({
        slug: article.slug,
        title: article.title,
        summary: article.summary ?? '',
        modules: article.modules,
        tags: [],
        bodyExcerpt: article.bodyExcerpt ?? '',
        sensitivity: 'INTERNAL',
        source: 'tenant-kb', // will be overridden to global-kb by caller
      });
    }
  }

  return results.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Aliases: terminology dictionary
// ---------------------------------------------------------------------------

export async function getTenantAliases(tenantId: string): Promise<Map<string, string[]>> {
  const aliases = await prisma.tenantAlias.findMany({
    where: { tenantId },
  });

  const map = new Map<string, string[]>();
  for (const alias of aliases) {
    map.set(alias.term.toLowerCase(), alias.aliases);
  }
  return map;
}

export async function upsertTenantAlias(input: {
  tenantId: string;
  term: string;
  aliases: string[];
}): Promise<void> {
  await prisma.tenantAlias.upsert({
    where: {
      tenantId_term: {
        tenantId: input.tenantId,
        term: input.term.toLowerCase(),
      },
    },
    create: {
      tenantId: input.tenantId,
      term: input.term.toLowerCase(),
      aliases: input.aliases,
    },
    update: {
      aliases: input.aliases,
    },
  });
}

// ---------------------------------------------------------------------------
// Tool evidence adapter
// ---------------------------------------------------------------------------

export function tenantKnowledgeToEvidence(
  articles: TenantKnowledgeSearchResult[],
  query: string,
): ToolEvidence {
  if (!articles.length) {
    return createEvidence({
      summary: 'Tidak ditemukan artikel yang relevan di Knowledge Base.',
      facts: [{ label: 'Pencarian', value: query }],
      source: 'global-kb',
      completeness: 'partial',
    });
  }

  const tenantArticles = articles.filter((a) => a.source === 'tenant-kb');
  const globalArticles = articles.filter((a) => a.source !== 'tenant-kb');

  const facts: { label: string; value: string }[] = [];
  for (const a of tenantArticles) {
    facts.push({ label: `[SOP] ${a.title}`, value: a.summary?.slice(0, 150) || '' });
  }
  for (const a of globalArticles) {
    facts.push({ label: `[Panduan] ${a.title}`, value: a.summary?.slice(0, 150) || '' });
  }

  return createEvidence({
    summary: `Artikel ditemukan (${tenantArticles.length} SOP perusahaan, ${globalArticles.length} panduan Polyflow):`,
    facts,
    source: tenantArticles.length > 0 ? 'tenant-kb' : 'global-kb',
  });
}
