'use server';

import { withTenant } from '@/lib/core/tenant';
import { requireAuth } from '@/lib/tools/auth-checks';
import { safeAction } from '@/lib/errors/errors';
import { serializeData } from '@/lib/utils/utils';
import { prisma } from '@/lib/core/prisma';
import { getAssignedCustomers } from '@/services/sales/customer-assignment-service';

// ── List sales team members with active customer counts ──────────

export const getSalesTeamAction = withTenant(
    async function getSalesTeamAction() {
        return safeAction(async () => {
            await requireAuth();

            const users = await prisma.user.findMany({
                where: {
                    isActive: true,
                    isSuperAdmin: false,
                    OR: [
                        { roles: { some: { role: 'SALES' } } },
                        { role: 'SALES' },
                        { roles: { some: { role: 'MARKETING' } } },
                        { role: 'MARKETING' },
                    ],
                },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                    roles: { select: { role: true } },
                    _count: {
                        select: {
                            customerSalesAssignments: {
                                where: { unassignedAt: null },
                            },
                        },
                    },
                },
                orderBy: { name: 'asc' },
            });

            return serializeData(
                users.map((u) => ({
                    id: u.id,
                    name: u.name,
                    email: u.email,
                    role: u.role,
                    roles: u.roles.map((r) => r.role),
                    activeCustomerCount: u._count.customerSalesAssignments,
                })),
            );
        });
    },
);

// ── List customers assigned to a given sales user ─────────────────

export const getSalesTeamAssignedCustomersAction = withTenant(
    async function getSalesTeamAssignedCustomersAction(userId: string) {
        return safeAction(async () => {
            await requireAuth();

            const assignments = await getAssignedCustomers(userId);

            return serializeData(assignments);
        });
    },
);
