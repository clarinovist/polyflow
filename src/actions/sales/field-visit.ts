'use server';

import { withTenant } from '@/lib/core/tenant';
import { requireSalesAccess } from '@/lib/auth/sales-access';
import { safeAction } from '@/lib/errors/errors';
import { serializeData } from '@/lib/utils/utils';
import {
    startFieldVisit,
    completeFieldVisit,
    } from '@/services/sales/field-visit-service';

// ── Start visit ──────────────────────────────────────────────────

export const startFieldVisitAction = withTenant(
    async function startFieldVisitAction(data: {
        customerId: string;
        latitude: number;
        longitude: number;
        distance: number;
        clientVisitId: string;
        routePlanItemId?: string;
        isExtraCall?: boolean;
        extraReason?: string;
    }) {
        return safeAction(async () => {
            const session = await requireSalesAccess();
            const visit = await startFieldVisit({
                ...data,
                userId: session.user.id,
            });
            return serializeData(visit);
        });
    },
);

// ── Complete visit (checkout) ────────────────────────────────────

export const completeFieldVisitAction = withTenant(
    async function completeFieldVisitAction(data: {
        clientVisitId: string;
        notes: string;
        photoUrl?: string;
    }) {
        return safeAction(async () => {
            const session = await requireSalesAccess();
            const visit = await completeFieldVisit({
                ...data,
                userId: session.user.id,
            });
            return serializeData(visit);
        });
    },
);