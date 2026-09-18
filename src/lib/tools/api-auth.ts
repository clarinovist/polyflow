import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getMainPrisma, prisma } from '@/lib/core/prisma';
import { resolveTenantContext } from '@/lib/core/tenant';
import { hasAnyRole } from '@/lib/auth/roles';

type ApiAuthResult =
  | { response: NextResponse; userId: '' }
  | { response: null; userId: string };

/**
 * Non-redirecting upload guard. Validate the session user in the request's DB,
 * then apply the same session-role policy as the existing action guards.
 * Omit allowedRoles for endpoints that accept any authenticated user.
 */
export async function requireApiAuth(
  request: Pick<Request, 'headers'>,
  allowedRoles?: string[],
): Promise<ApiAuthResult> {
  const deny = (status: 401 | 403, code: string): ApiAuthResult => ({
    response: NextResponse.json(
      { error: status === 401 ? 'Unauthorized' : 'Forbidden', code },
      { status },
    ),
    userId: '',
  });

  const session = await auth();
  if (!session?.user?.id) return deny(401, 'UNAUTHORIZED');

  const tenant = await resolveTenantContext(request.headers);
  // A tenant lookup failure must never validate a user against the main DB.
  if (tenant.type === 'NOT_FOUND') return deny(403, 'TENANT_NOT_FOUND');
  const db = tenant.type === 'RESOLVED' ? tenant.tenantDb : getMainPrisma();
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true },
  });
  if (!user) return deny(401, 'UNAUTHORIZED');
  if (allowedRoles && !hasAnyRole(session.user, allowedRoles)) {
    return deny(403, 'FORBIDDEN');
  }

  return { response: null, userId: session.user.id };
}

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
