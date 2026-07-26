'use server';

import { withTenant } from '@/lib/core/tenant';
import { requireAuth } from '@/lib/tools/auth-checks';
import { safeAction } from '@/lib/errors/errors';
import { serializeData } from '@/lib/utils/utils';
import {
    startFieldVisit,
    completeFieldVisit,
    syncVisitLogs,
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
            const session = await requireAuth();
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
            const session = await requireAuth();
            const visit = await completeFieldVisit({
                ...data,
                userId: session.user.id,
            });
            return serializeData(visit);
        });
    },
);

// ── Sync offline logs ────────────────────────────────────────────

export const syncVisitLogsAction = withTenant(
    async function syncVisitLogsAction(
        logs: {
            clientVisitId: string;
            customerId: string;
            checkInTime: string;
            checkOutTime: string;
            durationSeconds: number;
            latitude: number;
            longitude: number;
            distance: number;
            notes: string | null;
            photoUrl: string | null;
            isExtraCall?: boolean;
            extraReason?: string;
            routePlanItemId?: string;
        }[],
    ) {
        return safeAction(async () => {
            const session = await requireAuth();
            const results = await syncVisitLogs(session.user.id, logs);
            const syncedCount = results.filter((r) => r.success).length;
            return { count: syncedCount, results };
        });
    },
);
