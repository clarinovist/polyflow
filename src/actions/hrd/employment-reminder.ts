'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { safeAction } from '@/lib/errors/errors';
import { requireHrdApprover } from '@/lib/auth/hrd-access';
import { dispatchReminders } from '@/lib/hrd/employment-reminder';
import { logActivity } from '@/lib/tools/audit';

export const scanEmploymentReminders = withTenant(
    async function scanEmploymentReminders() {
        return safeAction(async () => {
            const session = await requireHrdApprover();
            const result = await dispatchReminders(prisma);
            await logActivity({
                userId: session.user.id,
                action: 'HRD_REMINDER_SCAN',
                entityType: 'System',
                entityId: 'employment-reminder',
                details: `Scanned ${result.scanned} expiring employees, created ${result.created} notifications`,
            });
            return result;
        });
    },
);
