import { NextRequest, NextResponse } from 'next/server';
import { withTenantRoute } from '@/lib/core/tenant';
import { getTenantIdFromContext } from '@/lib/core/prisma';
import { prisma } from '@/lib/core/prisma';
import { isMiniAppEnabled } from '@/lib/telegram/kill-switch';
import { verifyTelegramSession, extractSessionTokenFromCookieHeader } from '@/lib/telegram/session';
import { logTelegramAudit } from '@/lib/telegram/audit';

function getIp(req: NextRequest): string {
  return (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
}

export const GET = withTenantRoute(async function GET(req: NextRequest) {
  const startedAt = Date.now();
  const ip = getIp(req);

  if (!isMiniAppEnabled()) {
    return NextResponse.json({ error: 'Mini App disabled' }, { status: 503 });
  }

  const rawToken = extractSessionTokenFromCookieHeader(req.headers.get('cookie'));
  if (!rawToken) {
    return NextResponse.json({ error: 'No session' }, { status: 401 });
  }
  const verified = await verifyTelegramSession(rawToken);
  if (!verified.valid) {
    return NextResponse.json({ error: verified.reason }, { status: 401 });
  }

  const { tenantId, userId, telegramUserId } = verified.session;
  const ctxTenantId = getTenantIdFromContext();
  const effectiveTenantId = ctxTenantId || tenantId;

  const checkedAt = new Date().toISOString();
  const kpis: Array<{ key: string; label: string; value: number | string; checkedAt: string; domain?: string }> = [];
  const alerts: Array<{ type: string; message: string; deepLink: string }> = [];

  try {
    const rows = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM (
        SELECT p.name
        FROM "Inventory" i
        JOIN "ProductVariant" pv ON i."productVariantId" = pv.id
        JOIN "Product" p ON pv."productId" = p.id
        GROUP BY p.name
        HAVING SUM(i.quantity) < SUM(pv."minStockAlert") AND SUM(pv."minStockAlert") > 0
      ) t
    `;
    const criticalCount = Number(rows?.[0]?.count || 0);
    kpis.push({ key: 'criticalStock', label: 'Stok kritis', value: criticalCount, checkedAt, domain: 'stock' });
    if (criticalCount > 0) {
      alerts.push({
        type: 'criticalStock',
        message: `${criticalCount} produk berada di bawah batas minimum`,
        deepLink: '/telegram/data/stock?filter=critical',
      });
    }
  } catch { /* ignore */ }

  try {
    const activeProd = await prisma.productionOrder.count({ where: { status: 'IN_PROGRESS' } }).catch(() => 0);
    kpis.push({ key: 'activeProduction', label: 'SPK aktif', value: activeProd, checkedAt, domain: 'production' });
  } catch { /* ignore */ }

  try {
    const pendingSo = await prisma.salesOrder.count({ where: { status: { in: ['CONFIRMED', 'IN_PRODUCTION', 'READY_TO_SHIP'] } } }).catch(() => 0);
    kpis.push({ key: 'pendingSales', label: 'SO pending', value: pendingSo, checkedAt, domain: 'sales' });
    if (pendingSo > 0) {
      alerts.push({ type: 'pendingSales', message: `${pendingSo} SO menunggu pengiriman`, deepLink: '/telegram/data/sales?filter=pending' });
    }
  } catch { /* ignore */ }

  try {
    const overdue = await prisma.invoice.count({ where: { status: 'OVERDUE' } }).catch(() => 0);
    kpis.push({ key: 'overdueInvoices', label: 'Invoice overdue', value: overdue, checkedAt, domain: 'finance' });
  } catch { /* ignore */ }

  try {
    const pendingPo = await prisma.purchaseOrder.count({ where: { status: { in: ['SENT', 'PARTIAL_RECEIVED'] } } }).catch(() => 0);
    kpis.push({ key: 'pendingPo', label: 'PO outstanding', value: pendingPo, checkedAt, domain: 'purchasing' });
  } catch { /* ignore */ }

  logTelegramAudit({
    action: 'HOME_FETCH',
    telegramUserId,
    userId,
    tenantId: effectiveTenantId,
    outcome: 'SUCCESS',
    ip,
    latencyMs: Date.now() - startedAt,
  });

  return NextResponse.json({
    kpis,
    alerts,
    checkedAt,
    tenantId: effectiveTenantId,
  });
});
