'use server';

import { withTenant } from '@/lib/core/tenant';
import { requireAuth } from '@/lib/tools/auth-checks';
import { requireSalesManager } from '@/lib/auth/sales-access';
import { safeAction } from '@/lib/errors/errors';
import { serializeData } from '@/lib/utils/utils';
import {
    assignCustomerToSales,
    unassignCustomerFromSales,
    getCustomerAssignments,
    getAssignedCustomers,
} from '@/services/sales/customer-assignment-service';

// ── Assign customer to sales ─────────────────────────────────────

export const assignCustomerAction = withTenant(
    async function assignCustomerAction(data: {
        customerId: string;
        userId: string;
        isPrimary?: boolean;
        notes?: string;
    }) {
        return safeAction(async () => {
            const session = await requireSalesManager();

            const assignment = await assignCustomerToSales({
                ...data,
                assignedById: session.user.id,
            });

            return serializeData(assignment);
        });
    },
);

// ── Unassign customer from sales ─────────────────────────────────

export const unassignCustomerAction = withTenant(
    async function unassignCustomerAction(data: {
        customerId: string;
        userId: string;
    }) {
        return safeAction(async () => {
            await requireSalesManager();

            const result = await unassignCustomerFromSales(data);
            return serializeData(result);
        });
    },
);

// ── Get customer assignments ─────────────────────────────────────

export const getCustomerAssignmentsAction = withTenant(
    async function getCustomerAssignmentsAction(customerId: string) {
        return safeAction(async () => {
            await requireAuth();
            const assignments = await getCustomerAssignments(customerId);
            return serializeData(assignments);
        });
    },
);

// ── Get my assigned customers ────────────────────────────────────

export const getMyAssignedCustomers = withTenant(
    async function getMyAssignedCustomers() {
        return safeAction(async () => {
            const session = await requireAuth();
            const assignments = await getAssignedCustomers(session.user.id);
            return serializeData(assignments.map((a) => a.customer));
        });
    },
);
