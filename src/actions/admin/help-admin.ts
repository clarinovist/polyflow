'use server';

import { auth } from '@/auth';
import { getMainPrisma } from '@/lib/core/prisma';
import { Prisma } from '@prisma/client';
import { logActivity } from '@/lib/tools/audit';
import { ValidationError } from '@/lib/errors/errors';

async function requireSuperAdmin() {
  const session = await auth();
  if (!session?.user || !(session.user as { isSuperAdmin?: boolean }).isSuperAdmin) {
    throw new ValidationError('Only super-admin can access help admin.');
  }
  return session;
}

// ─── Conversations ──────────────────────────────────────

export interface ListConversationsParams {
  page?: number;
  limit?: number;
  outcome?: string;
  channel?: string;
  tenantId?: string;
  q?: string;
}

export async function listHelpConversations(params: ListConversationsParams = {}) {
  await requireSuperAdmin();
  const mainDb = getMainPrisma();

  const { page = 1, limit = 20, outcome, channel, tenantId, q } = params;
  const where: Prisma.HelpInteractionWhereInput = {};

  if (outcome) where.outcome = outcome as never;
  if (channel) where.channel = channel;
  if (tenantId) where.tenantId = tenantId;
  if (q) where.question = { contains: q, mode: 'insensitive' };

  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    mainDb.helpInteraction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        tenantId: true,
        userId: true,
        channel: true,
        question: true,
        answerPreview: true,
        outcome: true,
        feedback: true,
        latencyMs: true,
        blockedReason: true,
        createdAt: true,
      },
    }),
    mainDb.helpInteraction.count({ where }),
  ]);

  // Resolve tenant names
  const tenantIds = [...new Set(items.map((i) => i.tenantId).filter(Boolean))] as string[];
  const tenants = tenantIds.length > 0
    ? await mainDb.tenant.findMany({
        where: { id: { in: tenantIds } },
        select: { id: true, name: true, subdomain: true },
      })
    : [];
  const tenantMap = Object.fromEntries(tenants.map((t) => [t.id, t.name || t.subdomain]));

  const enriched = items.map((i) => ({
    ...i,
    tenantName: i.tenantId ? tenantMap[i.tenantId] || i.tenantId : null,
  }));

  return { items: enriched, total, page, limit };
}

// ─── Help Settings ──────────────────────────────────────

export interface HelpSettingItem {
  key: string;
  valueJson: string;
  updatedAt: Date;
  updatedBy: string | null;
}

const DEFAULT_SETTINGS: Record<string, unknown> = {
  virtualCsEnabled: true,
  kbRetrievalEnabled: true,
  autoLearnDraftEnabled: false,
  autoPublishEnabled: false,
  minClusterSizeForDraft: 3,
  feedbackThumbsEnabled: true,
  guardrailMode: 'intent_v2',
  maxAgentToolLoops: 4,
  channels: ['web', 'telegram'],
  maxQuestionLength: 2000,
};

export async function getHelpSettings(): Promise<HelpSettingItem[]> {
  await requireSuperAdmin();
  const mainDb = getMainPrisma();

  const rows = await mainDb.helpSettings.findMany({
    orderBy: { key: 'asc' },
  });

  // Merge defaults for missing keys (not persisted yet)
  const existingKeys = new Set(rows.map((r) => r.key));
  const allRows: HelpSettingItem[] = [...rows];

  for (const [key, defaultValue] of Object.entries(DEFAULT_SETTINGS)) {
    if (!existingKeys.has(key)) {
      allRows.push({
        key,
        valueJson: JSON.stringify(defaultValue),
        updatedAt: new Date(0),
        updatedBy: null,
      });
    }
  }

  return allRows.sort((a, b) => a.key.localeCompare(b.key));
}

export async function setHelpSetting(key: string, valueJson: string) {
  const session = await requireSuperAdmin();
  const mainDb = getMainPrisma();
  const userId = (session.user as { id?: string }).id;

  if (!key || !key.trim()) throw new ValidationError('Key is required.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(valueJson);
  } catch {
    throw new ValidationError('valueJson must be valid JSON.');
  }

  // Guard: autoPublish must stay false
  if (key === 'autoPublishEnabled' && parsed === true) {
    throw new ValidationError('autoPublishEnabled must stay OFF (supervised-only).');
  }

  const row = await mainDb.helpSettings.upsert({
    where: { key },
    create: {
      key,
      valueJson,
      updatedBy: userId,
    },
    update: {
      valueJson,
      updatedBy: userId,
    },
  });

  try {
    await logActivity({
      userId: userId || 'system',
      action: 'HELP_SETTINGS_UPDATED',
      entityType: 'HelpSettings',
      entityId: key,
      details: `${key} = ${valueJson.slice(0, 200)}`,
    });
  } catch { /* best effort */ }

  return row;
}

export async function getHelpSettingValue<T>(key: string, fallback: T): Promise<T> {
  const mainDb = getMainPrisma();
  const row = await mainDb.helpSettings.findUnique({ where: { key } });
  if (!row) return fallback;
  try {
    return JSON.parse(row.valueJson) as T;
  } catch {
    return fallback;
  }
}

// ─── Dashboard stats ────────────────────────────────────

export async function getHelpDashboardStats(days = 7) {
  await requireSuperAdmin();
  const mainDb = getMainPrisma();

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [total, byOutcome, byFeedback, avgLatency, byChannel, topGaps] = await Promise.all([
    mainDb.helpInteraction.count({ where: { createdAt: { gte: since } } }),
    mainDb.helpInteraction.groupBy({
      by: ['outcome'],
      where: { createdAt: { gte: since } },
      _count: { outcome: true },
    }),
    mainDb.helpInteraction.groupBy({
      by: ['feedback'],
      where: { createdAt: { gte: since }, feedback: { not: null } },
      _count: { feedback: true },
    }),
    mainDb.helpInteraction.aggregate({
      where: { createdAt: { gte: since } },
      _avg: { latencyMs: true },
    }),
    mainDb.helpInteraction.groupBy({
      by: ['channel'],
      where: { createdAt: { gte: since } },
      _count: { channel: true },
    }),
    mainDb.$queryRaw<{ question: string; count: bigint }[]>`
      SELECT "question", COUNT(*)::bigint as count
      FROM "HelpInteraction"
      WHERE "createdAt" >= ${since}
        AND "outcome" IN ('FAILED', 'BLOCKED', 'PARTIAL')
      GROUP BY "question"
      ORDER BY count DESC
      LIMIT 15
    `,
  ]);

  return {
    total,
    byOutcome: Object.fromEntries(byOutcome.map((o) => [o.outcome, o._count.outcome])),
    byFeedback: Object.fromEntries(byFeedback.map((f) => [f.feedback || 'null', f._count.feedback])),
    avgLatency: Math.round(avgLatency._avg.latencyMs || 0),
    byChannel: Object.fromEntries(byChannel.map((c) => [c.channel, c._count.channel])),
    topGaps: topGaps.map((q) => ({ question: q.question, count: Number(q.count) })),
    days,
  };
}
