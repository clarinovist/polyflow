'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { BusinessRuleError, safeAction } from '@/lib/errors/errors';
import { requireHrdFinance } from '@/lib/auth/hrd-access';
import { requireAuth } from '@/lib/tools/auth-checks';
import { hasAnyRole } from '@/lib/auth/roles';
import { dispatchReminders, HR_ALERT_TYPES } from '@/lib/hrd/employment-reminder';
import { logActivity } from '@/lib/tools/audit';
import { NotificationService } from '@/services/core/notification-service';

/** Scan is a write-ish job: ADMIN or HRD only (FINANCE may only read alerts). */
async function requireScanAccess() {
    const session = await requireAuth();
    if (!hasAnyRole(session.user, ['ADMIN', 'HRD'])) {
        throw new BusinessRuleError(
            'Hanya admin atau HRD yang dapat menjalankan pemindaian peringatan.',
        );
    }
    return session;
}

export const scanEmploymentReminders = withTenant(
    async function scanEmploymentReminders() {
        return safeAction(async () => {
            const session = await requireScanAccess();
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

export const markHrAlertRead = withTenant(async function markHrAlertRead(
    id: string,
) {
    return safeAction(async () => {
        const session = await requireHrdFinance();
        if (!id) throw new BusinessRuleError('Peringatan tidak valid.');
        const result = await NotificationService.markAsRead(
            id,
            session.user.id,
        );
        if (result.count === 0) {
            throw new BusinessRuleError('Peringatan tidak ditemukan.');
        }
        return { updated: result.count };
    });
});

export const markHrAlertsAllRead = withTenant(
    async function markHrAlertsAllRead() {
        return safeAction(async () => {
            const session = await requireHrdFinance();
            const result = await NotificationService.markAllAsRead(
                session.user.id,
                HR_ALERT_TYPES,
            );
            return { updated: result.count };
        });
    },
);
