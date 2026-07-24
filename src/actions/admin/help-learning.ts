'use server';

import { auth } from '@/auth';
import { getMainPrisma } from '@/lib/core/prisma';
import { Prisma } from '@prisma/client';
import { logActivity } from '@/lib/tools/audit';
import { ValidationError, NotFoundError } from '@/lib/errors/errors';

async function requireSuperAdmin() {
  const session = await auth();
  if (!session?.user || !(session.user as { isSuperAdmin?: boolean }).isSuperAdmin) {
    throw new ValidationError('Only super-admin can manage learning queue.');
  }
  return session;
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 120);
}

// ─── Clusters ──────────────────────────────────────────────

export interface ListClustersParams {
  page?: number;
  limit?: number;
  status?: string;
  q?: string;
}

export async function listHelpClusters(params: ListClustersParams = {}) {
  await requireSuperAdmin();
  const mainDb = getMainPrisma();

  const { page = 1, limit = 20, status, q } = params;
  const where: Prisma.HelpQuestionClusterWhereInput = {};
  if (status) where.status = status as never;
  if (q) where.canonicalQuestion = { contains: q, mode: 'insensitive' };

  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    mainDb.helpQuestionCluster.findMany({
      where,
      orderBy: [{ hitCount: 'desc' }, { lastSeenAt: 'desc' }],
      skip,
      take: limit,
    }),
    mainDb.helpQuestionCluster.count({ where }),
  ]);

  return { items, total, page, limit };
}

export async function ignoreCluster(id: string) {
  const session = await requireSuperAdmin();
  const mainDb = getMainPrisma();
  const userId = (session.user as { id?: string }).id;

  const cluster = await mainDb.helpQuestionCluster.findUnique({ where: { id } });
  if (!cluster) throw new NotFoundError('Cluster not found.');

  const updated = await mainDb.helpQuestionCluster.update({
    where: { id },
    data: { status: 'IGNORED' },
  });

  try {
    await logActivity({
      userId: userId || 'system',
      action: 'HELP_CLUSTER_IGNORED',
      entityType: 'HelpQuestionCluster',
      entityId: id,
      details: cluster.canonicalQuestion.slice(0, 200),
    });
  } catch { /* best effort */ }

  return updated;
}

export async function reopenCluster(id: string) {
  await requireSuperAdmin();
  const mainDb = getMainPrisma();

  const cluster = await mainDb.helpQuestionCluster.findUnique({ where: { id } });
  if (!cluster) throw new NotFoundError('Cluster not found.');

  return mainDb.helpQuestionCluster.update({
    where: { id },
    data: { status: 'OPEN' },
  });
}

// ─── Drafts ───────────────────────────────────────────────

export interface ListDraftsParams {
  page?: number;
  limit?: number;
  status?: string;
}

export async function listHelpDrafts(params: ListDraftsParams = {}) {
  await requireSuperAdmin();
  const mainDb = getMainPrisma();

  const { page = 1, limit = 20, status } = params;
  const where: Prisma.HelpLearningDraftWhereInput = {};
  if (status) where.status = status as never;

  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    mainDb.helpLearningDraft.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        cluster: { select: { id: true, canonicalQuestion: true, sampleQuestions: true, hitCount: true, suggestedModule: true } },
      },
    }),
    mainDb.helpLearningDraft.count({ where }),
  ]);

  return { items, total, page, limit };
}

export async function getHelpDraft(id: string) {
  await requireSuperAdmin();
  const mainDb = getMainPrisma();
  const draft = await mainDb.helpLearningDraft.findUnique({
    where: { id },
    include: {
      cluster: true,
    },
  });
  if (!draft) throw new NotFoundError('Draft not found.');
  return draft;
}

export async function approveDraftAsArticle(id: string, opts?: { editTitle?: string; editBody?: string; modules?: string[]; tags?: string[] }) {
  const session = await requireSuperAdmin();
  const mainDb = getMainPrisma();
  const userId = (session.user as { id?: string }).id;

  const draft = await mainDb.helpLearningDraft.findUnique({
    where: { id },
    include: { cluster: true },
  });
  if (!draft) throw new NotFoundError('Draft not found.');
  if (draft.status !== 'PENDING_REVIEW') throw new ValidationError('Only PENDING_REVIEW drafts can be approved.');

  const title = (opts?.editTitle || draft.draftTitle).trim();
  const bodyMd = (opts?.editBody || draft.draftBodyMd).trim();
  if (!title || !bodyMd) throw new ValidationError('Title and body required.');

  const slugBase = slugify(title);
  if (!slugBase) throw new ValidationError('Title must produce valid slug.');
  const existingSlug = await mainDb.helpArticle.findUnique({ where: { slug: slugBase } });
  const finalSlug = existingSlug ? `${slugBase}-${Date.now().toString(36)}` : slugBase;

  const article = await mainDb.helpArticle.create({
    data: {
      slug: finalSlug,
      title,
      summary: draft.summary || '',
      bodyMd,
      modules: opts?.modules || draft.modules || ['global'],
      tags: opts?.tags || draft.tags || [],
      source: 'AUTO_LEARN',
      status: 'PUBLISHED',
      publishedAt: new Date(),
      createdBy: userId,
      updatedBy: userId,
    },
  });

  await mainDb.helpLearningDraft.update({
    where: { id },
    data: {
      status: 'APPROVED',
      reviewedBy: userId,
      reviewedAt: new Date(),
    },
  });

  if (draft.clusterId) {
    await mainDb.helpQuestionCluster.update({
      where: { id: draft.clusterId },
      data: { status: 'RESOLVED' },
    });
  }

  try {
    await logActivity({
      userId: userId || 'system',
      action: 'HELP_DRAFT_APPROVED_AS_ARTICLE',
      entityType: 'HelpArticle',
      entityId: article.id,
      details: `Draft ${id} → ${finalSlug}`,
    });
  } catch { /* best effort */ }

  return article;
}

export async function rejectDraft(id: string, reviewNote?: string) {
  const session = await requireSuperAdmin();
  const mainDb = getMainPrisma();
  const userId = (session.user as { id?: string }).id;

  const draft = await mainDb.helpLearningDraft.findUnique({ where: { id } });
  if (!draft) throw new NotFoundError('Draft not found.');

  const updated = await mainDb.helpLearningDraft.update({
    where: { id },
    data: {
      status: 'REJECTED',
      reviewedBy: userId,
      reviewNote: reviewNote?.slice(0, 2000) || null,
      reviewedAt: new Date(),
    },
  });

  // Re-open cluster so it can be drafted again if still hot
  if (draft.clusterId) {
    await mainDb.helpQuestionCluster.update({
      where: { id: draft.clusterId },
      data: { status: 'OPEN' },
    }).catch(() => {});
  }

  return updated;
}

export async function runLearningJobNow() {
  await requireSuperAdmin();
  const { runLearningDraftJob } = await import('@/lib/bot/help-learning');
  const result = await runLearningDraftJob();
  return result;
}
