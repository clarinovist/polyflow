import { withTenantRoute } from '@/lib/core/tenant';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/core/prisma';
import { requireApiRoles } from '@/lib/tools/api-auth';

export const GET = withTenantRoute(async function GET(req: Request) {
  const auth = await requireApiRoles(['ADMIN', 'PLANNING', 'PRODUCTION']);
  if (auth.response) return auth.response;

  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim() ?? '';
  const onlyDefault = url.searchParams.get('onlyDefault')?.trim() === 'true';
  const routes = await prisma.productionRoute.findMany({
    where: {
      status: 'ACTIVE',
      ...(onlyDefault ? { isDefault: true } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { code: { contains: q, mode: 'insensitive' } },
              { productVariant: { skuCode: { contains: q, mode: 'insensitive' } } },
              { productVariant: { name: { contains: q, mode: 'insensitive' } } },
              { productVariant: { product: { name: { contains: q, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    },
    orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    take: 50,
    select: {
      id: true,
      code: true,
      name: true,
      version: true,
      isDefault: true,
      _count: { select: { steps: true } },
      productVariant: { select: { skuCode: true, name: true, primaryUnit: true, product: { select: { name: true, productType: true } } } },
    },
  });
  return NextResponse.json(routes);
});
