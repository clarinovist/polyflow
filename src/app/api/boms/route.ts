import { withTenantRoute } from '@/lib/core/tenant';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/core/prisma';
import { requireApiRoles } from '@/lib/tools/api-auth';

export const GET = withTenantRoute(async function GET(req: Request) {
  const auth = await requireApiRoles(['ADMIN', 'PLANNING', 'PRODUCTION']);
  if (auth.response) return auth.response;

  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim() ?? '';
  const productVariantId = url.searchParams.get('productVariantId')?.trim() ?? '';
  const boms = await prisma.bom.findMany({
    where: {
      isActive: true,
      archivedAt: null,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { productVariant: { skuCode: { contains: q, mode: 'insensitive' } } },
              { productVariant: { name: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
      ...(productVariantId ? { productVariantId } : {}),
    },
    orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    take: 40,
    select: {
      id: true,
      name: true,
      outputQuantity: true,
      isDefault: true,
      productVariantId: true,
      productVariant: { select: { skuCode: true, name: true, product: { select: { name: true } } } },
    },
  });
  return NextResponse.json(boms);
});
