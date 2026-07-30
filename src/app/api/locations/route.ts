import { withTenantRoute } from '@/lib/core/tenant';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/core/prisma';
import { requireApiRoles } from '@/lib/tools/api-auth';
import { isInactiveLocation } from '@/lib/locations/resolve-location';

export const GET = withTenantRoute(async function GET(req: Request) {
  const auth = await requireApiRoles(['ADMIN', 'PLANNING', 'PRODUCTION', 'WAREHOUSE']);
  if (auth.response) return auth.response;

  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim() ?? '';
  const locs = await prisma.location.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { slug: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {},
    orderBy: { name: 'asc' },
    take: 30,
    select: { id: true, name: true, slug: true },
  });
  return NextResponse.json(locs.filter((l) => !isInactiveLocation(l)));
});
