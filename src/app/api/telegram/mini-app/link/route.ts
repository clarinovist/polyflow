import { NextRequest, NextResponse } from 'next/server';
import { withTenantRoute } from '@/lib/core/tenant';
import { getTenantIdFromContext } from '@/lib/core/prisma';
import { prisma } from '@/lib/core/prisma';
import { rateLimit } from '@/lib/api/rate-limit';
import bcrypt from 'bcryptjs';
import { validateTelegramInitData } from '@/lib/telegram/init-data-validation';
import { getBotToken, getInitDataMaxAgeSec, isMiniAppEnabled } from '@/lib/telegram/kill-switch';
import { checkPilotAdminGate } from '@/lib/telegram/allowlist';
import { logTelegramAudit } from '@/lib/telegram/audit';
import { createIdentity } from '@/lib/telegram/identity-service';
import { validateAndConsumeLinkToken } from '@/lib/telegram/link-token-service';
import { createTelegramSession, buildSessionCookieHeader } from '@/lib/telegram/session';

function getIp(req: NextRequest): string {
  return (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
}

export const POST = withTenantRoute(async function POST(req: NextRequest) {
  const ip = getIp(req);

  if (!isMiniAppEnabled()) {
    return NextResponse.json({ error: 'Mini App disabled' }, { status: 503 });
  }

  const limiter = rateLimit(`tg-link:${ip}`, 5, 60_000);
  if (!limiter.success) {
    return NextResponse.json({ error: 'Rate limit, try later' }, { status: 429 });
  }

  let body: { initData?: string; token?: string; email?: string; password?: string };
  try {
    body = await req.json() as { initData?: string; token?: string; email?: string; password?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const initData = body?.initData?.trim();
  if (!initData) return NextResponse.json({ error: 'initData required' }, { status: 400 });

  const botToken = getBotToken();
  if (!botToken) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });

  const validation = validateTelegramInitData(initData, botToken, { maxAgeSec: getInitDataMaxAgeSec() });
  if (!validation.valid) {
    const err = (validation as { valid: false; error: string }).error;
    return NextResponse.json({ error: err }, { status: 401 });
  }

  const tgUserId = validation.data.user?.id ? String(validation.data.user.id) : null;
  const tgUsername = validation.data.user?.username;
  const tgChatId = validation.data.chat_instance;
  if (!tgUserId) return NextResponse.json({ error: 'Telegram user id missing' }, { status: 400 });

  const effectiveTenantId = getTenantIdFromContext();
  if (!effectiveTenantId) {
    return NextResponse.json({ error: 'Tenant not resolved' }, { status: 404 });
  }

  let targetUserId: string | null = null;

  if (body.token) {
    const tokenValidation = await validateAndConsumeLinkToken(body.token.trim(), effectiveTenantId);
    if (!tokenValidation.valid) {
      logTelegramAudit({ action: 'LINK_FAILED', telegramUserId: tgUserId, tenantId: effectiveTenantId, outcome: tokenValidation.reason, ip });
      return NextResponse.json({ error: tokenValidation.reason }, { status: 400 });
    }
    targetUserId = tokenValidation.userId;
  } else if (body.email && body.password) {
    const limEmail = rateLimit(`tg-link-email:${body.email.toLowerCase()}:${ip}`, 5, 300_000);
    if (!limEmail.success) return NextResponse.json({ error: 'Too many attempts for this email' }, { status: 429 });

    const user = await prisma.user.findUnique({
      where: { email: body.email.toLowerCase().trim() },
      select: { id: true, email: true, password: true, role: true, isActive: true, isSuperAdmin: true, name: true },
    });
    if (!user) {
      logTelegramAudit({ action: 'LINK_FAILED', telegramUserId: tgUserId, tenantId: effectiveTenantId, outcome: 'user not found', ip });
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }
    if (user.isActive === false) return NextResponse.json({ error: 'User inactive' }, { status: 403 });
    const ok = await bcrypt.compare(body.password, user.password);
    if (!ok) {
      logTelegramAudit({ action: 'LINK_FAILED', telegramUserId: tgUserId, userId: user.id, tenantId: effectiveTenantId, outcome: 'bad password', ip });
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    let assignedRoles: string[] = [];
    try {
      const rows = await prisma.userRole.findMany({ where: { userId: user.id }, select: { role: true } });
      assignedRoles = rows.map((r) => r.role as string);
    } catch {
      assignedRoles = [user.role];
    }

    const gate = checkPilotAdminGate({ role: user.role, roles: assignedRoles, email: user.email, isSuperAdmin: user.isSuperAdmin });
    if (!gate.allowed) {
      logTelegramAudit({ action: gate.reason?.includes('allowlist') ? 'ALLOWLIST_BLOCKED' : 'ADMIN_BLOCKED', telegramUserId: tgUserId, userId: user.id, tenantId: effectiveTenantId, outcome: gate.reason || 'blocked', ip });
      return NextResponse.json({ error: gate.reason }, { status: 403 });
    }

    targetUserId = user.id;
  } else {
    return NextResponse.json({ error: 'token or email+password required' }, { status: 400 });
  }

  if (!targetUserId) return NextResponse.json({ error: 'No target user' }, { status: 400 });

  const identity = await createIdentity({
    telegramUserId: tgUserId,
    telegramChatId: tgChatId || undefined,
    telegramUsername: tgUsername || undefined,
    tenantId: effectiveTenantId,
    userId: targetUserId,
  });

  const { rawToken, expiresAt } = await createTelegramSession({
    telegramUserId: tgUserId,
    tenantId: effectiveTenantId,
    userId: targetUserId,
    telegramIdentityId: identity.id,
  });

  logTelegramAudit({ action: 'LINK_SUCCESS', telegramUserId: tgUserId, userId: targetUserId, tenantId: effectiveTenantId, outcome: 'SUCCESS', ip });

  const res = NextResponse.json({
    status: 'LINKED',
    identity: { id: identity.id, telegramUserId: tgUserId, tenantId: effectiveTenantId, userId: targetUserId, linkedAt: identity.linkedAt },
    session: { expiresAt: expiresAt.toISOString() },
  });
  res.headers.set('Set-Cookie', buildSessionCookieHeader(rawToken, { expiresAt }));
  return res;
});
