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

  const variants = await prisma.productVariant.findMany({
    where,
    orderBy: { skuCode: 'asc' },
    take: 30,
    select: { id: true, skuCode: true, name: true, product: { select: { name: true, productType: true } } },
  });
  return NextResponse.json(variants);
});
