'use server';

import { Role } from '@prisma/client';
import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { requireFinanceAccess } from '@/lib/auth/finance-access';
import { getUserRoles, isTenantAdmin } from '@/lib/auth/roles';
import {
    hasWorkspaceEntitlement,
    isPathAllowedByResources,
} from '@/lib/auth/access-policy';
import { AuthorizationError, safeAction } from '@/lib/errors/errors';
import {
    getFinanceReturnDetail,
    getFinanceReturnPage,
    getFinanceReturnSummary,
} from '@/services/finance/sales-return-query-service';

/** Fresh resource check: direct action calls must not bypass the Finance layout. */
async function requireReturnReadAccess() {
    const session = await requireFinanceAccess();
    if (session.user.isSuperAdmin || !hasWorkspaceEntitlement('finance')) {
        throw new AuthorizationError();
    }
    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { isActive: true },
    });
    if (!user?.isActive) throw new AuthorizationError();
    if (isTenantAdmin(session.user)) return;
    const roles = getUserRoles(session.user).filter((role): role is Role =>
        Object.values(Role).includes(role as Role),
    );
    const permissions = await prisma.rolePermission.findMany({
        where: { role: { in: roles }, canAccess: true },
        select: { resource: true },
    });
    if (
        !isPathAllowedByResources(
            '/finance/returns',
            permissions.map((permission) => permission.resource),
        )
    ) {
        throw new AuthorizationError(
            'Anda tidak memiliki akses Retur Penjualan di Finance.',
        );
    }
}

export const getFinanceSalesReturnSummary = withTenant(
    async function getFinanceSalesReturnSummary() {
        return safeAction(async () => {
            await requireReturnReadAccess();
            return getFinanceReturnSummary();
        });
    },
);

export const getFinanceSalesReturnPage = withTenant(
    async function getFinanceSalesReturnPage(input: unknown = {}) {
        return safeAction(async () => {
            await requireReturnReadAccess();
            return getFinanceReturnPage(input);
        });
    },
);

export const getFinanceSalesReturnDetail = withTenant(
    async function getFinanceSalesReturnDetail(id: string) {
        return safeAction(async () => {
            await requireReturnReadAccess();
            return getFinanceReturnDetail(id);
        });
    },
);
