import { withTenantRoute } from '@/lib/core/tenant';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/core/prisma';
import { requireApiRoles } from '@/lib/tools/api-auth';

export const GET = withTenantRoute(async function GET(req: Request) {
  const auth = await requireApiRoles(['ADMIN', 'PLANNING', 'PRODUCTION', 'SALES']);
  if (auth.response) return auth.response;

  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim() ?? '';
  const typeParam = url.searchParams.get('type')?.trim() ?? '';
  const allowedTypes = typeParam
    ? typeParam.split(',').map((t) => t.trim()).filter(Boolean)
    : [];
  const hasBomParam = url.searchParams.get('hasBom')?.trim() === 'true';
  const includeCount = url.searchParams.get('includeBomCount')?.trim() === 'true' || hasBomParam;

  const where: Record<string, unknown> = {};
  if (q) {
    where.OR = [
      { skuCode: { contains: q, mode: 'insensitive' } },
      { name: { contains: q, mode: 'insensitive' } },
    ];
  }
  if (allowedTypes.length > 0) {
    where.product = { productType: { in: allowedTypes } };
  }
  if (hasBomParam) {
    // only variants with at least one active bom
    const existingWhere = where.product;
    where.boms = { some: { isActive: true, archivedAt: null } };
    // preserve product filter if already set
    if (existingWhere) {
      where.product = existingWhere;
    }
  }

  const variants = await (prisma.productVariant.findMany as unknown as (args: unknown) => Promise<Array<{
    id: string;
    skuCode: string;
    name: string;
    product: { name: string; productType: string };
    _count?: { boms: number };
    boms?: Array<{ id: string; name: string; isDefault: boolean; outputQuantity: unknown }>;
  }>>)({
    where,
    orderBy: { skuCode: 'asc' },
    take: 50,
    select: {
      id: true,
      skuCode: true,
      name: true,
      product: { select: { name: true, productType: true } },
      ...(includeCount
        ? {
            _count: { select: { boms: { where: { isActive: true, archivedAt: null } } } },
            boms: {
              where: { isActive: true, archivedAt: null },
              take: 10,
              orderBy: { isDefault: 'desc' },
              select: { id: true, name: true, isDefault: true, outputQuantity: true },
            },
          }
        : {}),
    },
  });

  // map to include bomCount at top-level for convenience
  const mapped = variants.map((v) => ({
    id: v.id,
    skuCode: v.skuCode,
    name: v.name,
    product: (v as { product: { name: string; productType: string } }).product,
    bomCount: v._count?.boms,
    boms: v.boms,
  }));

  return NextResponse.json(mapped);
});
