import { prisma } from '@/lib/core/prisma';
import type { Role } from '@prisma/client';
import type { AssistantSessionUserInput } from './assistant-types';

export type VerifiedAssistantSessionUser = Required<
    Pick<AssistantSessionUserInput, 'id'>
> &
    Omit<AssistantSessionUserInput, 'id'>;

/**
 * Re-resolve roles and resources from the active tenant DB on every chat
 * request. JWT/session resource snapshots are intentionally not authoritative
 * for assistant tools because permissions may have been revoked after login.
 */
export async function verifyAssistantSessionUser(
    sessionUser: AssistantSessionUserInput,
): Promise<VerifiedAssistantSessionUser | null> {
    if (!sessionUser.id) return null;

    try {
        const user = await prisma.user.findUnique({
            where: { id: sessionUser.id },
            select: {
                id: true,
                name: true,
                role: true,
                isSuperAdmin: true,
                isActive: true,
            },
        });
        if (!user || user.isActive === false) return null;

        if (user.isSuperAdmin) {
            return {
                id: user.id,
                name: user.name,
                role: user.role,
                roles: [user.role],
                isSuperAdmin: true,
                allowedResources: 'ALL',
            };
        }

        const roleRows = await prisma.userRole.findMany({
            where: { userId: user.id },
            select: { role: true },
        });
        const roles = [
            ...new Set([user.role, ...roleRows.map((row) => row.role)]),
        ].filter(Boolean) as Role[];
        const permissions = roles.length
            ? await prisma.rolePermission.findMany({
                  where: { role: { in: roles }, canAccess: true },
                  select: { resource: true },
              })
            : [];

        return {
            id: user.id,
            name: user.name,
            role: user.role,
            roles,
            isSuperAdmin: false,
            allowedResources: [
                ...new Set(
                    permissions.map((permission) => permission.resource),
                ),
            ],
        };
    } catch {
        return null;
    }
}
