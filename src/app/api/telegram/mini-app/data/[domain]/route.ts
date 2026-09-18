import { NextRequest, NextResponse } from 'next/server';
import { withTenantRoute } from '@/lib/core/tenant';
import { getTenantIdFromContext } from '@/lib/core/prisma';
import { prisma } from '@/lib/core/prisma';
import { rateLimit } from '@/lib/api/rate-limit';
import { isMiniAppEnabled } from '@/lib/telegram/kill-switch';
import {
    verifyTelegramSession,
    extractSessionTokenFromCookieHeader,
} from '@/lib/telegram/session';
import { logTelegramAudit } from '@/lib/telegram/audit';
import { findIdentityByTelegramUserId } from '@/lib/telegram/identity-service';
import {
    computeAllowedDomains,
    isValidDataDomain,
} from '@/lib/telegram/domain-access';
import { listPricesByProduct } from '@/services/sales/price-list-service';
import type { Role } from '@prisma/client';
import type { SalesOrderStatus, PurchaseOrderStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';

function getIp(req: NextRequest): string {
    return (req.headers.get('x-forwarded-for') || 'unknown')
        .split(',')[0]
        .trim();
}

type DataItem = {
    id: string;
    title: string;
    subtitle: string;
    status: string;
    statusVariant: 'critical' | 'warning' | 'ok' | 'neutral';
    meta: string;
};

type DataListResponse = {
    domain: string;
    filter: string;
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
    items: DataItem[];
};

const fmtRp = (n: number | bigint | string) =>
    `Rp ${Number(n).toLocaleString('id-ID')}`;

const fmtDate = (d: Date | string) =>
    new Date(d).toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });

async function fetchStock(
    filter: string,
    page: number,
    pageSize: number,
): Promise<{ total: number; items: DataItem[] }> {
    // Bug A: cabang 'all' dulu ikut memakai HAVING minStockAlert > 0, jadi SKU
    // yang belum diisi batas minimum tidak pernah muncul walau tab "Semua".
    // Sekarang hanya cabang 'critical' yang menyaring.
    const where =
        filter === 'critical'
            ? Prisma.sql`HAVING SUM(i.quantity) < SUM(pv."minStockAlert") AND SUM(pv."minStockAlert") > 0`
            : Prisma.empty;

    const rows = await prisma.$queryRaw<
        {
            variantId: string;
            productName: string;
            variantName: string;
            skuCode: string;
            qty: bigint;
            minStockAlert: bigint;
            unit: string;
        }[]
    >`
    SELECT
      pv.id AS "variantId",
      p.name AS "productName",
      pv.name AS "variantName",
      pv."skuCode",
      COALESCE(SUM(i.quantity), 0) AS qty,
      pv."minStockAlert",
      pv."primaryUnit" AS unit
    FROM "ProductVariant" pv
    JOIN "Product" p ON pv."productId" = p.id
    LEFT JOIN "Inventory" i ON i."productVariantId" = pv.id
    WHERE pv."archivedAt" IS NULL
    GROUP BY pv.id, p.name, pv.name, pv."skuCode", pv."minStockAlert", pv."primaryUnit"
    ${where}
    ORDER BY qty ASC
  `;

    const total = rows.length;
    const offset = page * pageSize;
    const sliced = rows.slice(offset, offset + pageSize);

    const items: DataItem[] = sliced.map((r) => {
        // minStockAlert bisa 0/null (batas belum diset) — jangan tandai CRITICAL.
        const min = Number(r.minStockAlert);
        const isCritical = min > 0 && Number(r.qty) < min;
        return {
            id: r.variantId,
            title: `${r.productName} — ${r.variantName}`,
            subtitle: `SKU: ${r.skuCode}`,
            status: isCritical ? 'CRITICAL' : 'OK',
            statusVariant: isCritical
                ? ('critical' as const)
                : ('ok' as const),
            meta: `${Number(r.qty).toLocaleString('id-ID')} ${r.unit} / min ${min.toLocaleString('id-ID')}`,
        };
    });

    return { total, items };
}

async function fetchSales(
    filter: string,
    page: number,
    pageSize: number,
): Promise<{ total: number; items: DataItem[] }> {
    const pendingStatuses: SalesOrderStatus[] = [
        'CONFIRMED',
        'IN_PRODUCTION',
        'READY_TO_SHIP',
    ];
    const statusFilter =
        filter === 'pending' ? { status: { in: pendingStatuses } } : {};

    const [rows, total] = await Promise.all([
        prisma.salesOrder.findMany({
            where: statusFilter,
            include: { customer: { select: { name: true } } },
            orderBy: { orderDate: 'desc' },
            skip: page * pageSize,
            take: pageSize,
        }),
        prisma.salesOrder.count({ where: statusFilter }),
    ]);

    const statusVariantMap: Record<string, DataItem['statusVariant']> = {
        CONFIRMED: 'warning',
        IN_PRODUCTION: 'warning',
        READY_TO_SHIP: 'ok',
        SHIPPED: 'ok',
        DELIVERED: 'ok',
        CANCELLED: 'neutral',
    };

    const items: DataItem[] = rows.map((r) => ({
        id: r.id,
        title: r.orderNumber,
        subtitle:
            (r as typeof r & { customer?: { name: string } | null }).customer
                ?.name || 'Tanpa customer',
        status: r.status,
        statusVariant: statusVariantMap[r.status] ?? 'neutral',
        meta: `${fmtRp(Number(r.totalAmount ?? 0))} • ${fmtDate(r.orderDate)}`,
    }));

    return { total, items };
}

async function fetchProduction(
    filter: string,
    page: number,
    pageSize: number,
): Promise<{ total: number; items: DataItem[] }> {
    const statusFilter =
        filter === 'active' ? { status: 'IN_PROGRESS' as const } : {};

    const [rows, total] = await Promise.all([
        prisma.productionOrder.findMany({
            where: statusFilter,
            include: {
                bom: { select: { productVariant: { select: { name: true } } } },
                location: { select: { name: true } },
            },
            orderBy: { plannedStartDate: 'desc' },
            skip: page * pageSize,
            take: pageSize,
        }),
        prisma.productionOrder.count({ where: statusFilter }),
    ]);

    const statusVariantMap: Record<string, DataItem['statusVariant']> = {
        IN_PROGRESS: 'warning',
        COMPLETED: 'ok',
        CANCELLED: 'neutral',
        WAITING_MATERIAL: 'critical',
    };

    const items: DataItem[] = rows.map((r) => ({
        id: r.id,
        title: r.orderNumber,
        subtitle: r.bom.productVariant.name,
        status: r.status,
        statusVariant: statusVariantMap[r.status] ?? 'neutral',
        meta: `${Number(r.plannedQuantity).toLocaleString('id-ID')} • ${r.location.name}`,
    }));

    return { total, items };
}

async function fetchFinance(
    filter: string,
    page: number,
    pageSize: number,
): Promise<{ total: number; items: DataItem[] }> {
    const statusFilter =
        filter === 'overdue' ? { status: 'OVERDUE' as const, AND: [await (await import('@/services/finance/sales-receivable-query')).positiveSalesReceivableWhere()] } : {};

    const [rows, total] = await Promise.all([
        prisma.invoice.findMany({
            where: statusFilter,
            include: {
                salesOrder: {
                    select: { customer: { select: { name: true } } },
                },
            },
            orderBy: { dueDate: 'asc' },
            skip: page * pageSize,
            take: pageSize,
        }),
        prisma.invoice.count({ where: statusFilter }),
    ]);

    const statusVariantMap: Record<string, DataItem['statusVariant']> = {
        OVERDUE: 'critical',
        UNPAID: 'warning',
        PARTIAL: 'warning',
        PAID: 'ok',
    };

    const items: DataItem[] = rows.map((r) => {
        const remaining = Number(r.totalAmount) - Number(r.paidAmount) - Number(r.creditedAmount ?? 0);
        const customerName = (
            r as typeof r & {
                salesOrder?: { customer?: { name: string } | null };
            }
        ).salesOrder?.customer?.name;
        return {
            id: r.id,
            title: r.invoiceNumber,
            subtitle: customerName || '-',
            status: r.status,
            statusVariant: statusVariantMap[r.status] ?? 'neutral',
            meta: `${fmtRp(remaining)} sisa • jatuh tempo ${r.dueDate ? fmtDate(r.dueDate) : '-'}`,
        };
    });

    return { total, items };
}

async function fetchPurchasing(
    filter: string,
    page: number,
    pageSize: number,
): Promise<{ total: number; items: DataItem[] }> {
    const outstandingStatuses: PurchaseOrderStatus[] = [
        'SENT',
        'PARTIAL_RECEIVED',
    ];
    const statusFilter =
        filter === 'outstanding' ? { status: { in: outstandingStatuses } } : {};

    const [rows, total] = await Promise.all([
        prisma.purchaseOrder.findMany({
            where: statusFilter,
            include: { supplier: { select: { name: true } } },
            orderBy: { orderDate: 'desc' },
            skip: page * pageSize,
            take: pageSize,
        }),
        prisma.purchaseOrder.count({ where: statusFilter }),
    ]);

    const statusVariantMap: Record<string, DataItem['statusVariant']> = {
        SENT: 'warning',
        PARTIAL_RECEIVED: 'warning',
        RECEIVED: 'ok',
        CANCELLED: 'neutral',
    };

    const items: DataItem[] = rows.map((r) => ({
        id: r.id,
        title: r.orderNumber,
        subtitle: r.supplier.name,
        status: r.status,
        statusVariant: statusVariantMap[r.status] ?? 'neutral',
        meta: `${fmtRp(Number(r.totalAmount ?? 0))} • ${fmtDate(r.orderDate)}`,
    }));

    return { total, items };
}

async function fetchPrice(
    filter: string,
    page: number,
    pageSize: number,
    search?: string,
): Promise<{ total: number; items: DataItem[] }> {
    // listPricesByProduct memakai halaman 1-based, route ini 0-based.
    const result = await listPricesByProduct({
        page: page + 1,
        pageSize,
        search: search?.trim() || undefined,
        onlyWithCustomPrice: filter === 'custom',
    });

    const items: DataItem[] = result.data.map((row) => {
        const hasCustom = row.customPriceCount > 0;

        let meta: string;
        if (row.basePrice == null && !hasCustom) {
            meta = 'Harga belum diset';
        } else {
            const parts: string[] = [];
            parts.push(
                row.basePrice != null
                    ? `Umum ${fmtRp(row.basePrice)}`
                    : 'Umum belum diset',
            );
            if (hasCustom && row.minPrice != null && row.maxPrice != null) {
                parts.push(
                    row.minPrice === row.maxPrice
                        ? `khusus ${fmtRp(row.minPrice)}`
                        : `khusus ${fmtRp(row.minPrice)}–${fmtRp(row.maxPrice)}`,
                );
            }
            meta = parts.join(' • ');
        }

        return {
            id: row.variantId,
            title: `${row.productName} — ${row.variantName}`,
            subtitle: `SKU: ${row.skuCode}`,
            status: hasCustom
                ? `${row.customPriceCount} HARGA KHUSUS`
                : 'HARGA UMUM',
            statusVariant: hasCustom
                ? ('warning' as const)
                : ('neutral' as const),
            meta,
        };
    });

    return { total: result.total, items };
}

const DOMAIN_FETCHERS: Record<
    string,
    (
        filter: string,
        page: number,
        pageSize: number,
        search?: string,
    ) => Promise<{ total: number; items: DataItem[] }>
> = {
    stock: fetchStock,
    sales: fetchSales,
    production: fetchProduction,
    finance: fetchFinance,
    purchasing: fetchPurchasing,
    price: fetchPrice,
};

const DEFAULT_FILTERS: Record<string, string> = {
    stock: 'critical',
    sales: 'pending',
    production: 'active',
    finance: 'overdue',
    purchasing: 'outstanding',
    price: 'all',
};

export const GET = withTenantRoute(async function GET(
    req: NextRequest,
    ctx: { params: Promise<Record<string, string | string[]>> },
) {
    const startedAt = Date.now();
    const ip = getIp(req);
    const { domain } = (await ctx.params) as { domain: string };

    if (!isMiniAppEnabled()) {
        return NextResponse.json(
            { error: 'Mini App disabled' },
            { status: 503 },
        );
    }

    const rawToken = extractSessionTokenFromCookieHeader(
        req.headers.get('cookie'),
    );
    if (!rawToken)
        return NextResponse.json({ error: 'No session' }, { status: 401 });

    const verified = await verifyTelegramSession(rawToken);
    if (!verified.valid) {
        return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const { tenantId, userId, telegramUserId } = verified.session;
    const ctxTenantId = getTenantIdFromContext();
    const effectiveTenantId = ctxTenantId || tenantId;

    const limiter = rateLimit(`tg-data:${userId}:${ip}`, 30, 60_000);
    if (!limiter.success) {
        return NextResponse.json({ error: 'Rate limit' }, { status: 429 });
    }

    const identity = await findIdentityByTelegramUserId(
        telegramUserId,
        effectiveTenantId,
    );
    if (!identity || identity.status === 'REVOKED') {
        logTelegramAudit({
            action: 'SESSION_INVALID',
            telegramUserId,
            userId,
            tenantId: effectiveTenantId,
            outcome: 'REVOKED',
            ip,
        });
        return NextResponse.json(
            { error: 'Identity revoked', status: 'REVOKED' },
            { status: 403 },
        );
    }

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true, isSuperAdmin: true, isActive: true },
    });
    if (!user || user.isActive === false) {
        logTelegramAudit({
            action: 'SESSION_INVALID',
            telegramUserId,
            userId,
            tenantId: effectiveTenantId,
            outcome: 'USER_INACTIVE',
            ip,
        });
        return NextResponse.json(
            { error: 'User inactive', status: 'USER_INACTIVE' },
            { status: 403 },
        );
    }

    if (!isValidDataDomain(domain)) {
        return NextResponse.json(
            { error: 'Domain tidak dikenal' },
            { status: 400 },
        );
    }

    let allowedResources: string[] | 'ALL' = [];
    let assignedRoles: string[] = [];
    // Dideklarasikan di scope luar karena gate harga di bawah membutuhkannya.
    let allRoles: Role[] = [];
    try {
        const roleRows = await prisma.userRole.findMany({
            where: { userId },
            select: { role: true },
        });
        assignedRoles = roleRows.map((r) => r.role as string);
        allRoles = [...new Set([user.role, ...assignedRoles])].filter(
            Boolean,
        ) as Role[];
        if (user.isSuperAdmin) {
            allowedResources = 'ALL';
        } else if (allRoles.length) {
            const perms = await prisma.rolePermission.findMany({
                where: { role: { in: allRoles }, canAccess: true },
                select: { resource: true },
            });
            allowedResources = [...new Set(perms.map((p) => p.resource))];
        }
    } catch {
        /* ignore */
    }

    const allowedDomains = computeAllowedDomains({
        isSuperAdmin: user.isSuperAdmin,
        role: user.role,
        assignedRoles,
        allowedResources,
    });

    if (!allowedDomains.has(domain)) {
        return NextResponse.json(
            { error: 'Domain tidak diizinkan', status: 'DOMAIN_FORBIDDEN' },
            { status: 403 },
        );
    }

    // Harga = data komersial sensitif. Keputusan user 2026-08-24: ADMIN saja.
    // Defense-in-depth — computeAllowedDomains sudah menyaring lewat cabang
    // `hasAll`, cek ini menjaga kalau ALL_DOMAINS dipakai ulang di tempat lain.
    if (domain === 'price') {
        const isAdmin = user.isSuperAdmin || allRoles.includes('ADMIN');
        if (!isAdmin) {
            logTelegramAudit({
                action: 'DATA_LIST_FETCH',
                telegramUserId,
                userId,
                tenantId: effectiveTenantId,
                outcome: 'PRICE_FORBIDDEN',
                ip,
            });
            return NextResponse.json(
                { error: 'Harga hanya untuk admin', status: 'PRICE_FORBIDDEN' },
                { status: 403 },
            );
        }
    }

    const url = new URL(req.url);
    const filterParam =
        url.searchParams.get('filter') || DEFAULT_FILTERS[domain] || '';
    const page = Math.max(0, parseInt(url.searchParams.get('page') || '0', 10));
    const pageSize = Math.min(
        50,
        Math.max(1, parseInt(url.searchParams.get('pageSize') || '20', 10)),
    );

    const fetcher = DOMAIN_FETCHERS[domain];
    // `q` hanya dibaca untuk domain harga — owner perlu mengetik nama produk
    // saat ditanya customer. Domain lain sengaja tidak berubah (scope kecil).
    const searchParam =
        domain === 'price'
            ? url.searchParams.get('q')?.slice(0, 100) || undefined
            : undefined;
    const { total, items } = await fetcher(
        filterParam,
        page,
        pageSize,
        searchParam,
    );

    logTelegramAudit({
        action: 'DATA_LIST_FETCH',
        telegramUserId,
        userId,
        tenantId: effectiveTenantId,
        outcome: 'SUCCESS',
        ip,
        latencyMs: Date.now() - startedAt,
    });

    const response: DataListResponse = {
        domain,
        filter: filterParam,
        page,
        pageSize,
        total,
        hasMore: (page + 1) * pageSize < total,
        items,
    };

    return NextResponse.json(response);
});
