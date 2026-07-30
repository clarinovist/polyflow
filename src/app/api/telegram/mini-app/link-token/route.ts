import { NextRequest, NextResponse } from 'next/server';
import { withTenantRoute } from '@/lib/core/tenant';
import { getTenantIdFromContext } from '@/lib/core/prisma';
import { auth } from '@/auth';
import { rateLimit } from '@/lib/api/rate-limit';
import { isMiniAppEnabled } from '@/lib/telegram/kill-switch';
import { createLinkToken } from '@/lib/telegram/link-token-service';
import { logTelegramAudit } from '@/lib/telegram/audit';

function getIp(req: NextRequest): string {
  return (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
}

type SessionUserShape = {
  user?: { id?: string; role?: string; roles?: string[]; email?: string; isSuperAdmin?: boolean };
};

export const POST = withTenantRoute(async function POST(req: NextRequest) {
  const ip = getIp(req);
  if (!isMiniAppEnabled()) {
    return NextResponse.json({ error: 'Mini App disabled' }, { status: 503 });
  }

  const session = (await auth().catch(() => null)) as SessionUserShape | null;
  const userId = session?.user?.id;
  const role = session?.user?.role;
  const roles = session?.user?.roles;
  const email = session?.user?.email;

  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const allRoles = [...new Set([...(roles || []), role].filter(Boolean) as string[])].map((r) => r.toUpperCase());
  const isAdmin = allRoles.includes('ADMIN') || session?.user?.isSuperAdmin;
  if (!isAdmin) return NextResponse.json({ error: 'Admin required' }, { status: 403 });

  const limiter = rateLimit(`tg-linktoken:${userId}:${ip}`, 5, 60_000);
  if (!limiter.success) return NextResponse.json({ error: 'Rate limit' }, { status: 429 });

  const tenantId = getTenantIdFromContext();
  if (!tenantId) return NextResponse.json({ error: 'Tenant not resolved' }, { status: 404 });

  const { token, expiresAt } = await createLinkToken({ tenantId, userId, expiresInSec: 600 });

  logTelegramAudit({ action: 'LINK_START', userId, tenantId, outcome: 'TOKEN_GENERATED', ip, details: { email } });

  return NextResponse.json({ token, expiresAt: expiresAt.toISOString(), expiresInSec: 600 });
});
