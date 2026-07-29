import { withTenantRoute } from '@/lib/core/tenant';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/core/prisma';
import { auth } from '@/auth';

export const GET = withTenantRoute(async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Planning/Admin only for process selector
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
  const roles = user ? [user.role] : [];
  // Also check UserRole table
  const userRoles = await prisma.userRole.findMany({ where: { userId: session.user.id }, select: { role: true } });
  const allRoles = [...roles, ...userRoles.map((r) => r.role)] as string[];
  const allowed = allRoles.includes('ADMIN') || allRoles.includes('PLANNING') || allRoles.includes('PRODUCTION');
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim() ?? '';
  const processes = await prisma.productionProcess.findMany({
    where: q
      ? {
          OR: [
            { code: { contains: q, mode: 'insensitive' } },
            { name: { contains: q, mode: 'insensitive' } },
          ],
          isActive: true,
        }
      : { isActive: true },
    orderBy: [{ code: 'asc' }],
    take: 30,
    select: { id: true, code: true, name: true, requiresMachine: true },
  });
  return NextResponse.json(processes);
});
