import { NextRequest, NextResponse } from 'next/server';
import { withTenantRoute } from '@/lib/core/tenant';
import { getTenantIdFromContext } from '@/lib/core/prisma';
import { prisma } from '@/lib/core/prisma';
import { isMiniAppEnabled } from '@/lib/telegram/kill-switch';
import { verifyTelegramSession, extractSessionTokenFromCookieHeader, buildClearSessionCookieHeader, revokeTelegramSessionsByUserId } from '@/lib/telegram/session';
import { logTelegramAudit } from '@/lib/telegram/audit';
import { findIdentityByTelegramUserId, revokeIdentity } from '@/lib/telegram/identity-service';

function getIp(req: NextRequest): string {
  return (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
}

export const POST = withTenantRoute(async function POST(req: NextRequest) {
  const ip = getIp(req);
  if (!isMiniAppEnabled()) {
    return NextResponse.json({ error: 'Mini App disabled' }, { status: 503 });
  }

  const rawToken = extractSessionTokenFromCookieHeader(req.headers.get('cookie'));
  if (!rawToken) return NextResponse.json({ error: 'No session' }, { status: 401 });

  const verified = await verifyTelegramSession(rawToken);
  if (!verified.valid) {
    const clearRes = NextResponse.json({ error: 'Invalid session, cleared' }, { status: 401 });
    clearRes.headers.set('Set-Cookie', buildClearSessionCookieHeader());
    return clearRes;
  }

  const { tenantId, userId, telegramUserId } = verified.session;
  const ctxTenantId = getTenantIdFromContext();
  const effectiveTenantId = ctxTenantId || tenantId;

  // Revoke identity
  const identity = await findIdentityByTelegramUserId(telegramUserId, effectiveTenantId);
  if (identity) {
    await revokeIdentity(identity.id).catch(() => {});
  }

  // Revoke all sessions for this user
  await revokeTelegramSessionsByUserId(effectiveTenantId, userId).catch(() => {});
  // Also clear all tokens for telegram user
  await prisma.telegramMiniAppSession.deleteMany({ where: { tenantId: effectiveTenantId, telegramUserId } }).catch(() => {});

  logTelegramAudit({ action: 'UNLINK', telegramUserId, userId, tenantId: effectiveTenantId, outcome: 'SUCCESS', ip });

  const res = NextResponse.json({ status: 'UNLINKED' });
  res.headers.set('Set-Cookie', buildClearSessionCookieHeader());
  return res;
});
