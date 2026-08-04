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
  const continuesFromVariantId = url.searchParams.get('continuesFromVariantId')?.trim() ?? '';

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
    take: 80,
    select: {
      id: true,
      name: true,
      outputQuantity: true,
      isDefault: true,
      productVariantId: true,
      productVariant: { select: { skuCode: true, name: true, product: { select: { name: true } } } },
      items: { select: { productVariantId: true } },
    },
  });

  let result: Array<(typeof boms)[number] & { isChainMatch?: boolean; chainMatch?: boolean }> = boms as never;

  if (continuesFromVariantId) {
    const chainMatched: typeof result = [];
    const rest: typeof result = [];
    for (const bom of boms as Array<(typeof boms)[number] & { items: Array<{ productVariantId: string }> }>) {
      const match = bom.items?.some((it) => it.productVariantId === continuesFromVariantId);
      if (match) chainMatched.push({ ...bom, isChainMatch: true, chainMatch: true } as never);
      else rest.push({ ...bom, isChainMatch: false, chainMatch: false } as never);
    }
    chainMatched.sort((a, b) => ((b as { isDefault?: boolean }).isDefault ? 1 : 0) - ((a as { isDefault?: boolean }).isDefault ? 1 : 0) || a.name.localeCompare(b.name));
    rest.sort((a, b) => ((b as { isDefault?: boolean }).isDefault ? 1 : 0) - ((a as { isDefault?: boolean }).isDefault ? 1 : 0) || a.name.localeCompare(b.name));
    result = [...chainMatched, ...rest];
    result = result.slice(0, 60);
  }

  return NextResponse.json(
    result.map(({ items: _items, ...rest }) => rest),
  );
});
