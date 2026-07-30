import { withTenantRoute } from '@/lib/core/tenant';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/core/prisma';
import { requireApiRoles } from '@/lib/tools/api-auth';

export const GET = withTenantRoute(async function GET(req: Request) {
  const auth = await requireApiRoles(['ADMIN', 'PLANNING', 'PRODUCTION']);
  if (auth.response) return auth.response;

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
