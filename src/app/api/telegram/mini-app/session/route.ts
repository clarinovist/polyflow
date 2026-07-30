import { NextRequest, NextResponse } from 'next/server';
import { withTenantRoute } from '@/lib/core/tenant';
import { getTenantIdFromContext } from '@/lib/core/prisma';
import { prisma } from '@/lib/core/prisma';
import { rateLimit } from '@/lib/api/rate-limit';
import {
  validateTelegramInitData,
} from '@/lib/telegram/init-data-validation';
import {
  getBotToken,
  isMiniAppEnabled,
  getInitDataMaxAgeSec,
} from '@/lib/telegram/kill-switch';
import {
  createTelegramSession,
  buildSessionCookieHeader,
} from '@/lib/telegram/session';
import { checkPilotAdminGate, isPilotTenant } from '@/lib/telegram/allowlist';
import { logTelegramAudit } from '@/lib/telegram/audit';
import { findIdentityByTelegramUserId, touchIdentityLastActive } from '@/lib/telegram/identity-service';
import type { Role } from '@prisma/client';

function getIp(req: NextRequest): string {
  return (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
}

function getSubdomainFromHeaders(req: NextRequest): string | null {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
  const hostname = host.split(':')[0];
  const baseDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'polyflow.uk';
  if (hostname.endsWith('.localhost')) {
    const sub = hostname.replace('.localhost', '');
    return sub || null;
  }
  if (hostname.endsWith(`.${baseDomain}`)) {
    const sub = hostname.replace(`.${baseDomain}`, '');
    if (['admin', 'www', 'app', 'api'].includes(sub.toLowerCase())) return null;
    return sub || null;
  }
  return null;
}

export const POST = withTenantRoute(async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const ip = getIp(req);

  if (!isMiniAppEnabled()) {
    logTelegramAudit({ action: 'KILL_SWITCH_BLOCKED', outcome: 'BLOCKED', ip, details: { route: 'mini-app/session' } });
    return NextResponse.json({ error: 'Mini App disabled' }, { status: 503 });
  }

  const limiter = rateLimit(`tg-session:${ip}`, 30, 60_000);
  if (!limiter.success) {
    return NextResponse.json({ error: 'Rate limit' }, { status: 429 });
  }

  let body: { initData?: string };
  try {
    body = await req.json() as { initData?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const initData = body?.initData?.trim();
  if (!initData) {
    return NextResponse.json({ error: 'initData required' }, { status: 400 });
  }

  const botToken = getBotToken();
  if (!botToken) {
    console.error('[TG_SESSION] TELEGRAM_BOT_TOKEN missing');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const validation = validateTelegramInitData(initData, botToken, {
    maxAgeSec: getInitDataMaxAgeSec(),
  });

  if (!validation.valid) {
    const err = (validation as { valid: false; error: string }).error;
    const isExpired = err.includes('expired');
    logTelegramAudit({
      action: isExpired ? 'SESSION_EXPIRED' : 'SESSION_INVALID',
      outcome: err,
      ip,
      details: { reason: err },
    });
    if (isExpired) {
      return NextResponse.json({ status: 'EXPIRED', error: 'initData expired, reopen Mini App' }, { status: 401 });
    }
    return NextResponse.json({ status: 'INVALID', error: 'Invalid initData' }, { status: 401 });
  }

  const parsed = validation.data;
  const tgUserId = parsed.user?.id ? String(parsed.user.id) : null;
  const tgUsername = parsed.user?.username;

  if (!tgUserId) {
    return NextResponse.json({ error: 'Telegram user not found in initData' }, { status: 400 });
  }

  const headerSubdomain = getSubdomainFromHeaders(req);
  const contextTenantId = getTenantIdFromContext();

  if (headerSubdomain && !isPilotTenant(headerSubdomain)) {
    logTelegramAudit({
      action: 'TENANT_MISMATCH',
      telegramUserId: tgUserId,
      outcome: 'BLOCKED',
      ip,
      details: { headerSubdomain, contextTenantIdPresent: !!contextTenantId },
    });
    return NextResponse.json({ status: 'TENANT_NOT_FOUND', error: 'Tenant not found for pilot' }, { status: 404 });
  }

  const effectiveTenantId = contextTenantId;
  if (!effectiveTenantId) {
    return NextResponse.json({ status: 'TENANT_NOT_FOUND', error: 'Tenant not resolved. Open from correct host.' }, { status: 404 });
  }

  const identity = await findIdentityByTelegramUserId(tgUserId, effectiveTenantId);

  if (!identity) {
    logTelegramAudit({
      action: 'LINK_START',
      telegramUserId: tgUserId,
      tenantId: effectiveTenantId,
      outcome: 'UNLINKED',
      ip,
      latencyMs: Date.now() - startedAt,
    });
    return NextResponse.json({
      status: 'UNLINKED',
      telegramUser: parsed.user ? { id: parsed.user.id, username: tgUsername, firstName: parsed.user.first_name } : null,
    });
  }

  if (identity.status === 'REVOKED') {
    logTelegramAudit({
      action: 'SESSION_INVALID',
      telegramUserId: tgUserId,
      userId: identity.userId,
      tenantId: effectiveTenantId,
      outcome: 'REVOKED',
      ip,
    });
    return NextResponse.json({ status: 'REVOKED', error: 'Access revoked' }, { status: 403 });
  }

  const user = await prisma.user.findUnique({
    where: { id: identity.userId },
    select: { id: true, name: true, email: true, role: true, isActive: true, isSuperAdmin: true },
  });

  if (!user) {
    return NextResponse.json({ status: 'USER_NOT_FOUND', error: 'Polyflow user not found' }, { status: 404 });
  }
  if (user.isActive === false) {
    logTelegramAudit({ action: 'ADMIN_BLOCKED', telegramUserId: tgUserId, userId: user.id, tenantId: effectiveTenantId, outcome: 'USER_INACTIVE', ip });
    return NextResponse.json({ status: 'USER_INACTIVE', error: 'User inactive' }, { status: 403 });
  }

  let assignedRoles: string[] = [];
  try {
    const roleRows = await prisma.userRole.findMany({ where: { userId: user.id }, select: { role: true } });
    assignedRoles = roleRows.map((r) => r.role as string);
  } catch {
    assignedRoles = [user.role];
  }

  const gate = checkPilotAdminGate({ role: user.role, roles: assignedRoles, email: user.email, isSuperAdmin: user.isSuperAdmin });
  if (!gate.allowed) {
    const isAllowlist = gate.reason?.includes('allowlist');
    logTelegramAudit({
      action: isAllowlist ? 'ALLOWLIST_BLOCKED' : 'ADMIN_BLOCKED',
      telegramUserId: tgUserId,
      userId: user.id,
      tenantId: effectiveTenantId,
      outcome: gate.reason || 'BLOCKED',
      ip,
    });
    return NextResponse.json({
      status: isAllowlist ? 'NOT_ALLOWLISTED' : 'NOT_ADMIN',
      error: isAllowlist ? 'Not in pilot allowlist' : 'Admin role required',
    }, { status: 403 });
  }

  let allowedResources: string[] = [];
  try {
    const allRoles = [...new Set([user.role, ...assignedRoles])].filter(Boolean) as Role[];
    if (allRoles.length) {
      const perms = await prisma.rolePermission.findMany({
        where: { role: { in: allRoles }, canAccess: true },
        select: { resource: true },
      });
      allowedResources = [...new Set(perms.map((p) => p.resource))];
    }
  } catch {
    // ignore
  }

  const domainMap: Record<string, string> = {
    '/warehouse/inventory': 'stock',
    '/sales/orders': 'sales',
    '/sales/deliveries': 'sales',
    '/production/orders': 'production',
    '/finance/invoices/sales': 'finance',
    '/finance/aging': 'finance',
    '/purchasing/orders': 'purchasing',
    '/hrd/attendance': 'hrd',
  };
  const allowedDomainsSet = new Set<string>();
  if (user.isSuperAdmin || assignedRoles.includes('ADMIN') || user.role === 'ADMIN') {
    ['stock', 'sales', 'production', 'finance', 'purchasing'].forEach((d) => allowedDomainsSet.add(d));
  } else {
    for (const res of allowedResources) {
      const dom = domainMap[res];
      if (dom) allowedDomainsSet.add(dom);
      if (res === '/warehouse') allowedDomainsSet.add('stock');
      if (res === '/sales') allowedDomainsSet.add('sales');
      if (res === '/production') allowedDomainsSet.add('production');
      if (res === '/finance') allowedDomainsSet.add('finance');
      if (res === '/purchasing') allowedDomainsSet.add('purchasing');
    }
  }

  touchIdentityLastActive(identity.id);

  const { rawToken, expiresAt } = await createTelegramSession({
    telegramUserId: tgUserId,
    tenantId: effectiveTenantId,
    userId: user.id,
    telegramIdentityId: identity.id,
  });

  logTelegramAudit({
    action: 'SESSION_CREATE',
    telegramUserId: tgUserId,
    userId: user.id,
    tenantId: effectiveTenantId,
    outcome: 'SUCCESS',
    ip,
    latencyMs: Date.now() - startedAt,
  });

  const res = NextResponse.json({
    status: 'LINKED',
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
    tenant: {
      id: effectiveTenantId,
      subdomain: headerSubdomain,
    },
    telegram: {
      userId: tgUserId,
      username: tgUsername,
      linkedAt: identity.linkedAt,
    },
    session: {
      expiresAt: expiresAt.toISOString(),
    },
  });

  res.headers.set('Set-Cookie', buildSessionCookieHeader(rawToken, { expiresAt }));
  return res;
});
