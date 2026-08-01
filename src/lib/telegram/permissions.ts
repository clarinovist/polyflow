import { prisma } from '@/lib/core/prisma';
import type { Role } from '@prisma/client';

export async function resolveAllowedResources(
  userId: string,
): Promise<string[] | 'ALL'> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, isSuperAdmin: true },
    });

    if (!user) return [];

    if (user.isSuperAdmin) return 'ALL';

    const roleRows = await prisma.userRole.findMany({
      where: { userId },
      select: { role: true },
    });
    const assignedRoles = roleRows.map((r) => r.role as string);
    const allRoles = [...new Set([user.role, ...assignedRoles])].filter(
      Boolean,
    ) as Role[];

    if (allRoles.length === 0) return [];

    const perms = await prisma.rolePermission.findMany({
      where: { role: { in: allRoles }, canAccess: true },
      select: { resource: true },
    });

    return [...new Set(perms.map((p) => p.resource))];
  } catch {
    return [];
  }
}
