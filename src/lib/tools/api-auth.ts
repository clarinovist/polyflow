import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/core/prisma';

/**
 * Shared API auth + role check used by route selector endpoints.
 * Returns a NextResponse with 401/403 on failure, or null on success.
 * Caller returns the response directly when non-null.
 */
export async function requireApiRoles(
  allowedRoles: string[],
): Promise<{ response: NextResponse | null; userId: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), userId: '' };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  const userRoles = await prisma.userRole.findMany({
    where: { userId: session.user.id },
    select: { role: true },
  });
  const allRoles = [
    user?.role,
    ...userRoles.map((r) => r.role),
  ].filter(Boolean) as string[];

  const allowed = allRoles.some((r) => allowedRoles.includes(r));
  if (!allowed) {
    return { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }), userId: session.user.id };
  }

  return { response: null, userId: session.user.id };
}
