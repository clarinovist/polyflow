import type { NotificationType, PrismaClient } from '@prisma/client';
import { resolveUsersForResources } from './finding-routing';
import { listPublishedArticles } from '@/lib/bot/help-articles';

export type NotifyOutcome = {
    findingsProcessed: number;
    notificationsSent: number;
};

// Fase 2 rollout scope — same two detectors as Fase 1 (see digest-service.ts
// LIFECYCLE_SCOPED_DETECTORS). Maps detector -> HelpArticle.modules tag and
// -> NotificationType so a new detector can't silently fall through either
// mapping without a deliberate decision.
const DETECTOR_HELP_MODULE: Record<string, string> = {
    critical_stock: 'warehouse',
    production_no_progress: 'production',
};

const DETECTOR_NOTIFICATION_TYPE: Record<string, NotificationType> = {
    critical_stock: 'LOW_STOCK',
    production_no_progress: 'PRODUCTION_STALLED',
};

async function attachHelpArticle(
    tenantDb: PrismaClient,
    finding: { id: string; detector: string },
): Promise<string | undefined> {
    const helpModule = DETECTOR_HELP_MODULE[finding.detector];
    if (!helpModule) return undefined;

    try {
        const articles = await listPublishedArticles({
            module: helpModule,
            limit: 1,
        });
        const slug = articles[0]?.slug;
        if (!slug) return undefined;

        await tenantDb.finding.update({
            where: { id: finding.id },
            data: { helpArticleSlug: slug },
        });
        return slug;
    } catch {
        // Never let a help-article lookup failure block the notification itself.
        return undefined;
    }
}

/**
 * Notifies eligible staff (by RolePermission routing) about findings that
 * are new or just reopened. Must be called with the same tenantDb the
 * findings were synced with — never the ambient `prisma` proxy, since this
 * runs from the same cron path documented in finding-sync.ts.
 */
export async function notifyNewFindings(
    tenantDb: PrismaClient,
    findingIds: string[],
): Promise<NotifyOutcome> {
    if (findingIds.length === 0) {
        return { findingsProcessed: 0, notificationsSent: 0 };
    }

    const findings = await tenantDb.finding.findMany({
        where: { id: { in: findingIds } },
        select: {
            id: true,
            detector: true,
            headline: true,
            detail: true,
            requiredResources: true,
            entityType: true,
            entityId: true,
        },
    });

    let notificationsSent = 0;

    for (const finding of findings) {
        await attachHelpArticle(tenantDb, finding);

        const userIds = await resolveUsersForResources(
            tenantDb,
            finding.requiredResources,
        );
        if (userIds.length === 0) continue;

        const type = DETECTOR_NOTIFICATION_TYPE[finding.detector] ?? 'SYSTEM';

        await tenantDb.notification.createMany({
            data: userIds.map((userId) => ({
                userId,
                type,
                title: finding.headline,
                message: finding.detail ?? finding.headline,
                link: `/findings/${finding.id}`,
                entityType: finding.entityType ?? undefined,
                entityId: finding.entityId ?? undefined,
            })),
        });
        notificationsSent += userIds.length;
    }

    return { findingsProcessed: findings.length, notificationsSent };
}
