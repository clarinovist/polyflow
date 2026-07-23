'use server';

import { auth } from '@/auth';
import { getMainPrisma } from '@/lib/core/prisma';
import { Prisma, HelpArticleStatus } from '@prisma/client';
import { logActivity } from '@/lib/tools/audit';
import { ValidationError, NotFoundError } from '@/lib/errors/errors';

async function requireSuperAdmin() {
  const session = await auth();
  if (!session?.user || !(session.user as { isSuperAdmin?: boolean }).isSuperAdmin) {
    throw new ValidationError('Only super-admin can manage help articles.');
  }
  return session;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
}

// ─── LIST ─────────────────────────────────────────

export interface ListHelpArticlesParams {
  page?: number;
  limit?: number;
  status?: HelpArticleStatus;
  module?: string;
  q?: string;
}

export async function listHelpArticles(params: ListHelpArticlesParams = {}) {
  await requireSuperAdmin();
  const mainDb = getMainPrisma();

  const { page = 1, limit = 20, status, module, q } = params;
  const where: Prisma.HelpArticleWhereInput = {};

  if (status) where.status = status;
  if (module) where.modules = { has: module };
  if (q) {
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { summary: { contains: q, mode: 'insensitive' } },
      { tags: { has: q.toLowerCase() } },
    ];
  }

  const skip = (page - 1) * limit;

  const [articles, total] = await Promise.all([
    mainDb.helpArticle.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        slug: true,
        title: true,
        summary: true,
        status: true,
        modules: true,
        tags: true,
        source: true,
        version: true,
        publishedAt: true,
        helpfulCount: true,
        notHelpfulCount: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    mainDb.helpArticle.count({ where }),
  ]);

  return { articles, total, page, limit };
}

// ─── GET ──────────────────────────────────────────

export async function getHelpArticle(id: string) {
  await requireSuperAdmin();
  const mainDb = getMainPrisma();

  const article = await mainDb.helpArticle.findUnique({ where: { id } });
  if (!article) throw new NotFoundError('Article not found.');
  return article;
}

// ─── CREATE ───────────────────────────────────────

export interface CreateHelpArticleInput {
  title: string;
  summary?: string;
  bodyMd: string;
  modules?: string[];
  tags?: string[];
  errorCodes?: string[];
  source?: 'SEED' | 'HUMAN' | 'AUTO_LEARN';
}

export async function createHelpArticle(input: CreateHelpArticleInput) {
  const session = await requireSuperAdmin();
  const mainDb = getMainPrisma();
  const userId = (session.user as { id?: string }).id;

  const slug = slugify(input.title);
  if (!slug) throw new ValidationError('Title must produce a valid slug.');

  // Ensure unique slug
  const existing = await mainDb.helpArticle.findUnique({ where: { slug } });
  const finalSlug = existing ? `${slug}-${Date.now().toString(36)}` : slug;

  const article = await mainDb.helpArticle.create({
    data: {
      slug: finalSlug,
      title: input.title,
      summary: input.summary || '',
      bodyMd: input.bodyMd,
      modules: input.modules || ['global'],
      tags: input.tags || [],
      errorCodes: input.errorCodes || [],
      source: input.source || 'HUMAN',
      createdBy: userId,
      updatedBy: userId,
    },
  });

  try {
    await logActivity({
      userId: userId || 'system',
      action: 'HELP_ARTICLE_CREATED',
      entityType: 'HelpArticle',
      entityId: article.id,
      details: article.title,
    });
  } catch { /* best effort */ }

  return article;
}

// ─── UPDATE ───────────────────────────────────────

export interface UpdateHelpArticleInput {
  title?: string;
  summary?: string;
  bodyMd?: string;
  modules?: string[];
  tags?: string[];
  errorCodes?: string[];
  slug?: string;
}

export async function updateHelpArticle(id: string, input: UpdateHelpArticleInput) {
  const session = await requireSuperAdmin();
  const mainDb = getMainPrisma();
  const userId = (session.user as { id?: string }).id;

  const existing = await mainDb.helpArticle.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Article not found.');

  const data: Prisma.HelpArticleUpdateInput = {
    updatedBy: userId,
  };

  if (input.title !== undefined) data.title = input.title;
  if (input.summary !== undefined) data.summary = input.summary;
  if (input.bodyMd !== undefined) data.bodyMd = input.bodyMd;
  if (input.modules !== undefined) data.modules = input.modules;
  if (input.tags !== undefined) data.tags = input.tags;
  if (input.errorCodes !== undefined) data.errorCodes = input.errorCodes;

  if (input.slug !== undefined && input.slug !== existing.slug) {
    const slugTaken = await mainDb.helpArticle.findUnique({ where: { slug: input.slug } });
    if (slugTaken) throw new ValidationError(`Slug '${input.slug}' already exists.`);
    data.slug = input.slug;
  } else if (input.title && !input.slug) {
    // Auto-update slug from title only if slug not explicitly set
    const newSlug = slugify(input.title);
    if (newSlug && newSlug !== existing.slug) {
      const slugTaken = await mainDb.helpArticle.findUnique({ where: { slug: newSlug } });
      if (!slugTaken) data.slug = newSlug;
    }
  }

  const article = await mainDb.helpArticle.update({ where: { id }, data });

  try {
    await logActivity({
      userId: userId || 'system',
      action: 'HELP_ARTICLE_UPDATED',
      entityType: 'HelpArticle',
      entityId: article.id,
      details: article.title,
    });
  } catch { /* best effort */ }

  return article;
}

// ─── PUBLISH ──────────────────────────────────────

export async function publishHelpArticle(id: string) {
  const session = await requireSuperAdmin();
  const mainDb = getMainPrisma();
  const userId = (session.user as { id?: string }).id;

  const existing = await mainDb.helpArticle.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Article not found.');

  const article = await mainDb.helpArticle.update({
    where: { id },
    data: {
      status: 'PUBLISHED',
      publishedAt: new Date(),
      version: existing.version + 1,
      updatedBy: userId,
    },
  });

  try {
    await logActivity({
      userId: userId || 'system',
      action: 'HELP_ARTICLE_PUBLISHED',
      entityType: 'HelpArticle',
      entityId: article.id,
      details: `${article.title} v${article.version}`,
    });
  } catch { /* best effort */ }

  return article;
}

// ─── ARCHIVE ──────────────────────────────────────

export async function archiveHelpArticle(id: string) {
  const session = await requireSuperAdmin();
  const mainDb = getMainPrisma();
  const userId = (session.user as { id?: string }).id;

  const existing = await mainDb.helpArticle.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Article not found.');

  const article = await mainDb.helpArticle.update({
    where: { id },
    data: {
      status: 'ARCHIVED',
      updatedBy: userId,
    },
  });

  try {
    await logActivity({
      userId: userId || 'system',
      action: 'HELP_ARTICLE_ARCHIVED',
      entityType: 'HelpArticle',
      entityId: article.id,
      details: article.title,
    });
  } catch { /* best effort */ }

  return article;
}
