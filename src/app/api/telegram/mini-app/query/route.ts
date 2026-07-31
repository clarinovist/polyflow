import { NextRequest, NextResponse } from 'next/server';
import { withTenantRoute } from '@/lib/core/tenant';
import { getTenantIdFromContext } from '@/lib/core/prisma';
import { prisma } from '@/lib/core/prisma';
import { rateLimit } from '@/lib/api/rate-limit';
import { isMiniAppEnabled } from '@/lib/telegram/kill-switch';
import { verifyTelegramSession, extractSessionTokenFromCookieHeader } from '@/lib/telegram/session';
import { logTelegramAudit } from '@/lib/telegram/audit';
import { findIdentityByTelegramUserId } from '@/lib/telegram/identity-service';
import { generateVirtualCsReply } from '@/lib/bot/virtual-cs-service';
import { logVirtualCsEvent } from '@/lib/bot/chat-audit';
import { POLYFLOW_PRODUCT_ID } from '@/lib/bot/product-scope';
import { buildAssistantContext } from '@/lib/bot/assistant-context';
import type { Role } from '@prisma/client';

function getIp(req: NextRequest): string {
  return (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
}

export const POST = withTenantRoute(async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const ip = getIp(req);

  if (!isMiniAppEnabled()) {
    return NextResponse.json({ error: 'Mini App disabled' }, { status: 503 });
  }

  const rawToken = extractSessionTokenFromCookieHeader(req.headers.get('cookie'));
  if (!rawToken) return NextResponse.json({ error: 'No session' }, { status: 401 });

  const verified = await verifyTelegramSession(rawToken);
  if (!verified.valid) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }

  const { tenantId, userId, telegramUserId } = verified.session;
  const ctxTenantId = getTenantIdFromContext();
  const effectiveTenantId = ctxTenantId || tenantId;

  const limiter = rateLimit(`tg-query:${userId}:${ip}`, 20, 60_000);
  if (!limiter.success) {
    return NextResponse.json({ error: 'Rate limit' }, { status: 429 });
  }

  const identity = await findIdentityByTelegramUserId(telegramUserId, effectiveTenantId);
  if (!identity || identity.status === 'REVOKED') {
    logTelegramAudit({ action: 'SESSION_INVALID', telegramUserId, userId, tenantId: effectiveTenantId, outcome: 'REVOKED', ip });
    return NextResponse.json({ error: 'Identity revoked', status: 'REVOKED' }, { status: 403 });
  }

  let body: { question?: string };
  try {
    body = await req.json() as { question?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const question = body?.question?.trim();
  if (!question) return NextResponse.json({ error: 'Question required' }, { status: 400 });
  if (question.length > 2000) return NextResponse.json({ error: 'Question too long' }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, role: true, isSuperAdmin: true, isActive: true },
  });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (user.isActive === false) {
    logTelegramAudit({ action: 'SESSION_INVALID', telegramUserId, userId, tenantId: effectiveTenantId, outcome: 'USER_INACTIVE', ip });
    return NextResponse.json({ error: 'User inactive', status: 'USER_INACTIVE' }, { status: 403 });
  }

  let allowedResources: string[] | 'ALL' = [];
  let assignedRoles: string[] = [];
  try {
    const roleRows = await prisma.userRole.findMany({ where: { userId }, select: { role: true } });
    assignedRoles = roleRows.map((r) => r.role as string);
    const allRoles = [...new Set([user.role, ...assignedRoles])].filter(Boolean) as Role[];
    if (user.isSuperAdmin) {
      allowedResources = 'ALL';
    } else if (allRoles.length) {
      const perms = await prisma.rolePermission.findMany({ where: { role: { in: allRoles }, canAccess: true }, select: { resource: true } });
      allowedResources = [...new Set(perms.map((p) => p.resource))];
    }
  } catch { /* ignore */ }

  const assistantCtx = buildAssistantContext(
    {
      id: user.id,
      name: user.name,
      role: user.role,
      roles: assignedRoles,
      isSuperAdmin: user.isSuperAdmin,
      allowedResources,
    },
    effectiveTenantId,
  );
  const mutableCtx = assistantCtx as typeof assistantCtx & { channel: string };
  mutableCtx.channel = 'telegram_mini_app';

  try {
    const result = await generateVirtualCsReply(
      { question, channel: 'telegram_mini_app', requesterName: user.name || undefined },
      { tenantId: effectiveTenantId, sessionUser: { id: user.id, name: user.name, role: user.role, roles: assignedRoles, isSuperAdmin: user.isSuperAdmin, allowedResources } },
    );

    await logVirtualCsEvent({
      channel: 'telegram_mini_app' as 'telegram',
      product: POLYFLOW_PRODUCT_ID,
      question,
      answer: result.answer,
      allowed: result.safety.allowed,
      blockedReason: result.safety.blockedReason,
      success: true,
      tenantId: effectiveTenantId,
      userId,
      latencyMs: Date.now() - startedAt,
    });

    logTelegramAudit({ action: 'HOME_FETCH', telegramUserId, userId, tenantId: effectiveTenantId, outcome: 'QUERY_SUCCESS', ip, latencyMs: Date.now() - startedAt });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('[TG_QUERY] failed', error);
    await logVirtualCsEvent({
      channel: 'telegram_mini_app' as 'telegram',
      product: POLYFLOW_PRODUCT_ID,
      question,
      allowed: false,
      blockedReason: 'Internal Server Error',
      success: false,
      tenantId: effectiveTenantId,
      userId,
      latencyMs: Date.now() - startedAt,
    });
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
});
