import type { FindingStatus, PrismaClient } from '@prisma/client';
import { canSeeFinding } from './finding-access';

// SNOOZED is excluded on purpose: a snoozed finding was dealt with for now, so
// it must clear the nav badge. The inbox still lists it under "Ditunda".
const COUNTED_STATUSES: FindingStatus[] = ['UNCLAIMED', 'CLAIMED'];

// Same bound as listMyFindings: visibility needs prefix semantics that Prisma
// array filters cannot express, so rows are filtered in memory.
const MAX_SCANNED_FINDINGS = 5000;

/**
 * Number of findings needing attention that this user may see. Cheap: one
 * count for full access, otherwise one lean query (resources column only).
 */
export async function countOpenVisibleFindings(
    db: Pick<PrismaClient, 'finding'>,
    allowed: string[] | 'ALL',
): Promise<number> {
    const where = { status: { in: COUNTED_STATUSES } };
    if (allowed === 'ALL') return db.finding.count({ where });
    if (allowed.length === 0) return 0;

    const rows = await db.finding.findMany({
        where,
        select: { requiredResources: true },
        take: MAX_SCANNED_FINDINGS,
    });
    return rows.filter((row) => canSeeFinding(allowed, row.requiredResources))
        .length;
}
