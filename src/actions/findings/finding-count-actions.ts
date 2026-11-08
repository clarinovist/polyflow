'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/core/prisma';
import { withTenant } from '@/lib/core/tenant';
import { resolveAllowedResources } from '@/lib/telegram/permissions';
import { countOpenVisibleFindings } from '@/lib/findings/finding-count';

/**
 * Count for the nav badge. Navigation chrome must never break a page, so any
 * failure (no session, DB hiccup) degrades to 0 and is logged.
 */
export const countMyOpenFindings = withTenant(
    async function countMyOpenFindings(): Promise<number> {
        try {
            const session = await auth();
            const userId = session?.user?.id;
            if (!userId) return 0;
            const allowed = await resolveAllowedResources(userId);
            return await countOpenVisibleFindings(prisma, allowed);
        } catch (error) {
            console.error('[countMyOpenFindings] failed', error);
            return 0;
        }
    },
);
