import { withTenantRoute } from '@/lib/core/tenant';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/core/prisma';
import { requireApiRoles } from '@/lib/tools/api-auth';

export const GET = withTenantRoute(async function GET(req: Request) {
  const auth = await requireApiRoles(['ADMIN', 'PLANNING', 'PRODUCTION']);
  if (auth.response) return auth.response;

  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim() ?? '';
  const routes = await prisma.productionRoute.findMany({
    where: q
      ? {
          status: 'ACTIVE',
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { code: { contains: q, mode: 'insensitive' } },
            { productVariant: { skuCode: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : { status: 'ACTIVE' },
    orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    take: 30,
    select: { id: true, code: true, name: true, version: true, isDefault: true, productVariant: { select: { skuCode: true, name: true, product: { select: { name: true } } } } },
  });
  return NextResponse.json(routes);
});
