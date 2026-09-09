import { prisma } from '../src/lib/core/prisma';

async function cleanupOldUsageEvents() {
    const RETENTION_DAYS = 90;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);

    console.log(`[UsageEventsCleanup] Cleaning events older than ${RETENTION_DAYS} days (cutoff: ${cutoffDate.toISOString()})...`);

    try {
        const deleted = await prisma.usageEvent.deleteMany({
            where: {
                occurredAt: {
                    lt: cutoffDate,
                },
            },
        });

        console.log(`[UsageEventsCleanup] Successfully deleted ${deleted.count} expired UsageEvent records.`);
    } catch (error) {
        console.error('[UsageEventsCleanup] Error during retention cleanup:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

cleanupOldUsageEvents();
