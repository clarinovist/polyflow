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
  const allowed = allRoles.includes('ADMIN') || allRoles.includes('PLANNING') || allRoles.includes('PRODUCTION') || allRoles.includes('SALES');
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim() ?? '';
  const variants = await prisma.productVariant.findMany({
    where: q
      ? {
          OR: [
            { skuCode: { contains: q, mode: 'insensitive' } },
            { name: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {},
    orderBy: { skuCode: 'asc' },
    take: 30,
    select: { id: true, skuCode: true, name: true, product: { select: { name: true } } },
  });
  return NextResponse.json(variants);
});
