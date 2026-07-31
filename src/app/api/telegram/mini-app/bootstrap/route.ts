import { NextRequest, NextResponse } from 'next/server';
import { withTenantRoute } from '@/lib/core/tenant';
import { getTenantIdFromContext } from '@/lib/core/prisma';
import { prisma } from '@/lib/core/prisma';
import { isMiniAppEnabled } from '@/lib/telegram/kill-switch';
import { verifyTelegramSession, extractSessionTokenFromCookieHeader } from '@/lib/telegram/session';
import { checkPilotAdminGate } from '@/lib/telegram/allowlist';
import { logTelegramAudit } from '@/lib/telegram/audit';
import { findIdentityByTelegramUserId } from '@/lib/telegram/identity-service';
import { computeAllowedDomains } from '@/lib/telegram/domain-access';
import type { Role } from '@prisma/client';

function getIp(req: NextRequest): string {
  return (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
}

export const GET = withTenantRoute(async function GET(req: NextRequest) {
  const startedAt = Date.now();
  const ip = getIp(req);

  if (!isMiniAppEnabled()) {
    return NextResponse.json({ error: 'Mini App disabled' }, { status: 503 });
  }

  const cookieHeader = req.headers.get('cookie');
  const rawToken = extractSessionTokenFromCookieHeader(cookieHeader);
  if (!rawToken) {
    return NextResponse.json({ error: 'No session', status: 'EXPIRED' }, { status: 401 });
  }

  const verified = await verifyTelegramSession(rawToken);
  if (!verified.valid) {
    const reason = verified.reason;
    logTelegramAudit({ action: reason === 'expired' ? 'SESSION_EXPIRED' : 'SESSION_INVALID', outcome: reason, ip });
    return NextResponse.json({ error: reason, status: reason === 'expired' ? 'EXPIRED' : 'INVALID' }, { status: 401 });
  }

  const { telegramUserId, tenantId, userId } = verified.session;
  const contextTenantId = getTenantIdFromContext();
  if (contextTenantId && contextTenantId !== tenantId) {
    logTelegramAudit({ action: 'TENANT_MISMATCH', telegramUserId, userId, tenantId, outcome: 'BLOCKED', ip });
    return NextResponse.json({ error: 'Tenant mismatch' }, { status: 403 });
  }

  const effectiveTenantId = contextTenantId || tenantId;

  // Reload identity + user
  const identity = await findIdentityByTelegramUserId(telegramUserId, effectiveTenantId);
  if (!identity || identity.status === 'REVOKED') {
    logTelegramAudit({ action: 'SESSION_INVALID', telegramUserId, userId, tenantId: effectiveTenantId, outcome: 'REVOKED', ip });
    return NextResponse.json({ error: 'Identity revoked', status: 'REVOKED' }, { status: 403 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, isActive: true, isSuperAdmin: true },
  });
  if (!user || user.isActive === false) {
    return NextResponse.json({ error: 'User inactive or not found', status: 'USER_INACTIVE' }, { status: 403 });
  }

  let assignedRoles: string[] = [];
  try {
    const rows = await prisma.userRole.findMany({ where: { userId }, select: { role: true } });
    assignedRoles = rows.map((r) => r.role as string);
  } catch {
    assignedRoles = [user.role];
  }

  const gate = checkPilotAdminGate({ role: user.role, roles: assignedRoles, email: user.email, isSuperAdmin: user.isSuperAdmin });
  if (!gate.allowed) {
    return NextResponse.json({ error: gate.reason, status: gate.reason?.includes('allowlist') ? 'NOT_ALLOWLISTED' : 'NOT_ADMIN' }, { status: 403 });
  }

  let allowedResources: string[] = [];
  try {
    const allRoles = [...new Set([user.role, ...assignedRoles])].filter(Boolean) as Role[];
    if (allRoles.length) {
      const perms = await prisma.rolePermission.findMany({ where: { role: { in: allRoles }, canAccess: true }, select: { resource: true } });
      allowedResources = [...new Set(perms.map((p) => p.resource))];
    }
  } catch {
    allowedResources = [];
  }

  const allowedDomainsSet = computeAllowedDomains({
    isSuperAdmin: user.isSuperAdmin,
    role: user.role,
    assignedRoles,
    allowedResources,
  });

  const pref = await prisma.telegramNotificationPreference.findUnique({
    where: { tenantId_userId: { tenantId: effectiveTenantId, userId } },
  }).catch(() => null);

  logTelegramAudit({
    action: 'BOOTSTRAP',
    telegramUserId,
    userId,
    tenantId: effectiveTenantId,
    outcome: 'SUCCESS',
    ip,
    latencyMs: Date.now() - startedAt,
  });

  return NextResponse.json({
    tenant: { id: effectiveTenantId },
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      roles: assignedRoles,
      isSuperAdmin: user.isSuperAdmin,
      allowedDomains: Array.from(allowedDomainsSet),
      allowedResources,
    },
    connection: {
      telegramUserId,
      linkedAt: identity.linkedAt,
      lastActiveAt: identity.lastActiveAt,
    },
    features: {
      notificationsEnabled: pref?.enabled ?? true,
      criticalStock: pref?.criticalStock ?? true,
      pilot: true,
    },
    version: '1.0.0-phase1',
  });
});
