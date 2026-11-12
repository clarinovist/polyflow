'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { safeAction } from '@/lib/errors/errors';
import { requireAuth } from '@/lib/tools/auth-checks';
import { isReadOnlyFactoryManager } from '@/lib/auth/read-only-role';

export interface StatusTimelineEntry {
    id: string;
    action: string;
    fromStatus: string | null;
    toStatus: string | null;
    details: string | null;
    createdAt: string;
    userName: string;
}

export const getEntityStatusTimeline = withTenant(
    async function getEntityStatusTimeline(
        entityType: string,
        entityId: string,
    ) {
        return safeAction(async () => {
            const session = await requireAuth();
            // Read-only Kepala Pabrik keeps the who/when/status trail but not
            // the free-text details, which can quote prices or amounts. The
            // entity type comes from the client, so no entity is exempt.
            const hideDetails = isReadOnlyFactoryManager(session.user);

            const logs = await prisma.auditLog.findMany({
                where: {
                    entityType,
                    entityId,
                },
                include: {
                    user: { select: { name: true } },
                },
                orderBy: { createdAt: 'asc' },
            });

            return logs.map((log) => ({
                id: log.id,
                action: log.action,
                fromStatus: log.fromStatus,
                toStatus: log.toStatus,
                details: hideDetails ? null : log.details,
                createdAt: log.createdAt.toISOString(),
                userName: log.user?.name ?? 'System',
            }));
        });
    },
);
