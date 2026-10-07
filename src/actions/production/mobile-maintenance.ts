'use server';

import {
    approveMaintenanceRequest,
    rejectMaintenanceRequest,
} from '@/actions/production/maintenance';
import { withTenant } from '@/lib/core/tenant';
import { safeAction } from '@/lib/errors/errors';
import { requireMobilePortalAccess } from '@/lib/mobile/mobile-portal-access';

async function requireMobileMaintenanceDecision() {
    return safeAction(async () => {
        await requireMobilePortalAccess(
            'production-supervisor',
            'feature:mobile-maintenance-approval',
        );
        return null;
    });
}

export const approveMobileMaintenanceRequest = withTenant(
    async function approveMobileMaintenanceRequest(
        id: string,
        assigneeId: string,
    ) {
        const access = await requireMobileMaintenanceDecision();
        if (!access.success) return access;
        return approveMaintenanceRequest(id, assigneeId);
    },
);

export const rejectMobileMaintenanceRequest = withTenant(
    async function rejectMobileMaintenanceRequest(id: string, reason: string) {
        const access = await requireMobileMaintenanceDecision();
        if (!access.success) return access;
        return rejectMaintenanceRequest(id, reason);
    },
);
