'use server';

import { withTenant } from '@/lib/core/tenant';
import {
    requireSalesAccess,
    requireSalesManager,
} from '@/lib/auth/sales-access';
import { safeAction } from '@/lib/errors/errors';
import { serializeData } from '@/lib/utils/utils';
import {
    listTeamVisits as svcListTeamVisits,
    getTeamComplianceSummary as svcGetTeamComplianceSummary,
    reviewVisit as svcReviewVisit,
    type ListTeamVisitsFilters,
} from '@/services/sales/visit-supervision-service';

// ── List team visits (supervisor) ──

export const listTeamVisits = withTenant(async function listTeamVisits(
    filters: ListTeamVisitsFilters,
) {
    return safeAction(async () => {
        await requireSalesAccess();
        const result = await svcListTeamVisits(filters);
        return serializeData(result);
    });
});

// ── Team compliance summary ──

export const getTeamComplianceSummary = withTenant(
    async function getTeamComplianceSummary(
        from: string,
        to: string,
        userId?: string,
    ) {
        return safeAction(async () => {
            await requireSalesAccess();
            const result = await svcGetTeamComplianceSummary(
                new Date(from),
                new Date(to),
                userId,
            );
            return serializeData(result);
        });
    },
);

// ── Review visit (ADMIN + MARKETING) ──

export const reviewVisitAction = withTenant(async function reviewVisitAction(
    visitId: string,
    decision: 'APPROVED' | 'REJECTED',
    notes?: string,
) {
    return safeAction(async () => {
        const session = await requireSalesManager();
        const result = await svcReviewVisit(
            visitId,
            decision,
            session.user.id,
            notes,
        );
        return serializeData(result);
    });
});
