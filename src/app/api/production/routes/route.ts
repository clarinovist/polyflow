import { withTenantRoute } from '@/lib/core/tenant';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/core/prisma';
import { auth } from '@/auth';

export const GET = withTenantRoute(async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
  const userRoles = await prisma.userRole.findMany({ where: { userId: session.user.id }, select: { role: true } });
  const allRoles = [user?.role, ...userRoles.map((r) => r.role)].filter(Boolean) as string[];
  const allowed = allRoles.includes('ADMIN') || allRoles.includes('PLANNING') || allRoles.includes('PRODUCTION');
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

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
