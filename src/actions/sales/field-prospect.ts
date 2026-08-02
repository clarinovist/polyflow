'use server';

import { withTenant } from '@/lib/core/tenant';
import {
    requireSalesAccess,
    requireSalesManager,
} from '@/lib/auth/sales-access';
import { safeAction, BusinessRuleError } from '@/lib/errors/errors';
import { serializeData } from '@/lib/utils/utils';
import {
    checkCustomerDuplicate,
    createProspectWithAssignment,
    verifyProspect,
    listProspects,
    rejectProspect,
} from '@/services/sales/field-prospect-service';

// ── Check duplicate ──────────────────────────────────────────────

export const checkCustomerDuplicateAction = withTenant(
    async function checkCustomerDuplicateAction(data: {
        name: string;
        phone?: string;
        latitude?: number;
        longitude?: number;
    }) {
        return safeAction(async () => {
            await requireSalesAccess();
            const result = await checkCustomerDuplicate(
                data.name,
                data.phone,
                data.latitude,
                data.longitude,
            );
            return serializeData(result);
        });
    },
);

// ── Create prospect with assignment ──────────────────────────────

export const createProspectAction = withTenant(
    async function createProspectAction(data: {
        name: string;
        phone?: string;
        billingAddress?: string;
        latitude?: number;
        longitude?: number;
        city?: string;
        photoUrl?: string;
    }) {
        return safeAction(async () => {
            const session = await requireSalesAccess();

            if (!data.name || data.name.trim().length < 2) {
                throw new BusinessRuleError('Nama toko minimal 2 karakter');
            }

            const customer = await createProspectWithAssignment({
                ...data,
                salesUserId: session.user.id,
            });

            return serializeData({
                id: customer.id,
                name: customer.name,
                code: customer.code,
            });
        });
    },
);

// ── List prospects (supervisor queue) ────────────────────────────

export const listProspectsAction = withTenant(
    async function listProspectsAction(filters?: {
        page?: number;
        pageSize?: number;
    }) {
        return safeAction(async () => {
            await requireSalesAccess();
            const result = await listProspects(
                filters?.page,
                filters?.pageSize,
            );
            return serializeData(result);
        });
    },
);

// ── Verify prospect (back-office) ────────────────────────────────

export const verifyProspectAction = withTenant(
    async function verifyProspectAction(customerId: string) {
        return safeAction(async () => {
            const session = await requireSalesManager();

            const result = await verifyProspect(customerId, session.user.id);
            return serializeData(result);
        });
    },
);

// ── Reject prospect (set INACTIVE) ───────────────────────────────

export const rejectProspectAction = withTenant(
    async function rejectProspectAction(customerId: string) {
        return safeAction(async () => {
            const session = await requireSalesManager();
            const result = await rejectProspect(customerId, session.user.id);
            return serializeData(result);
        });
    },
);
