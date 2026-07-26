'use server';

import { withTenant } from '@/lib/core/tenant';
import { requireAuth } from '@/lib/tools/auth-checks';
import { safeAction, BusinessRuleError } from '@/lib/errors/errors';
import { serializeData } from '@/lib/utils/utils';
import {
    checkCustomerDuplicate,
    createProspectWithAssignment,
    verifyProspect,
} from '@/services/sales/field-prospect-service';
import { hasAnyRole } from '@/lib/auth/roles';

// ── Check duplicate ──────────────────────────────────────────────

export const checkCustomerDuplicateAction = withTenant(
    async function checkCustomerDuplicateAction(data: {
        name: string;
        phone?: string;
        latitude?: number;
        longitude?: number;
    }) {
        return safeAction(async () => {
            await requireAuth();
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
            const session = await requireAuth();

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

// ── Verify prospect (back-office) ────────────────────────────────

export const verifyProspectAction = withTenant(
    async function verifyProspectAction(customerId: string) {
        return safeAction(async () => {
            const session = await requireAuth();
            if (!hasAnyRole(session.user, ['ADMIN', 'SALES_ADMIN'])) {
                throw new BusinessRuleError(
                    'Hanya admin atau sales admin yang dapat memverifikasi prospect',
                );
            }

            const result = await verifyProspect(customerId, session.user.id);
            return serializeData(result);
        });
    },
);
