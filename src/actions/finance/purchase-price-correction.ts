'use server';

import { Role } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { withTenant } from '@/lib/core/tenant';
import { getTenantDbFromContext } from '@/lib/core/prisma';
import { requireFinanceAccess, requireFinanceApprover } from '@/lib/auth/finance-access';
import { getUserRoles } from '@/lib/auth/roles';
import { hasWorkspaceEntitlement, isPathAllowedByResources } from '@/lib/auth/access-policy';
import { AuthorizationError, safeAction } from '@/lib/errors/errors';
import { serializeData } from '@/lib/utils/utils';
import {
    getPurchasePriceCorrectionContext,
    previewPurchasePriceCorrection,
    postPurchasePriceCorrection,
} from '@/services/purchasing/price-correction-service';

// Reuse the existing purchase-invoice resource, as sales price adjustments do.
async function access(mutation = false) {
    const session = await (mutation ? requireFinanceApprover() : requireFinanceAccess());
    const db = getTenantDbFromContext();
    if (!db || session.user.isSuperAdmin || !hasWorkspaceEntitlement('finance')) throw new AuthorizationError();
    const user = await db.user.findUnique({
        where: { id: session.user.id },
        select: { isActive: true, role: true, roles: { select: { role: true } } },
    });
    if (!user?.isActive) throw new AuthorizationError();
    const roles = getUserRoles({ role: user.role, roles: user.roles.map(row => row.role) })
        .filter((role): role is Role => Object.values(Role).includes(role as Role));
    if (!roles.some(role => role === 'ADMIN' || role === 'FINANCE')) throw new AuthorizationError();
    if (!roles.includes('ADMIN')) {
        const grants = await db.rolePermission.findMany({ where: { role: { in: roles }, canAccess: true }, select: { resource: true } });
        if (!isPathAllowedByResources('/finance/invoices/purchase', grants.map(row => row.resource))) throw new AuthorizationError();
    }
    return session.user.id;
}

export const getFinancePurchasePriceCorrectionContext = withTenant(
    async function getFinancePurchasePriceCorrectionContext(invoiceId: string) {
        return safeAction(async () => {
            await access();
            return serializeData(await getPurchasePriceCorrectionContext(invoiceId));
        });
    },
);

export const previewFinancePurchasePriceCorrection = withTenant(
    async function previewFinancePurchasePriceCorrection(input: unknown) {
        return safeAction(async () => {
            await access();
            return previewPurchasePriceCorrection(input);
        });
    },
);

export const postFinancePurchasePriceCorrection = withTenant(
    async function postFinancePurchasePriceCorrection(input: unknown) {
        return safeAction(async () => {
            const userId = await access(true);
            const result = await postPurchasePriceCorrection(input, userId);
            for (const path of [
                '/finance', '/finance/invoices/purchase', `/finance/invoices/purchase/${result.invoiceId}`,
                '/finance/journals', '/purchasing/orders', `/purchasing/orders/${result.purchaseOrderId}`, '/warehouse/stock',
            ]) revalidatePath(path);
            return serializeData(result);
        });
    },
);
