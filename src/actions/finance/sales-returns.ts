'use server';

import { Role } from '@prisma/client';
import { withTenant } from '@/lib/core/tenant';
import { prisma, getTenantDbFromContext } from '@/lib/core/prisma';
import { revalidatePath } from 'next/cache';
import { serializeData } from '@/lib/utils/utils';
import { postReturnCredit } from '@/services/finance/sales-return-credit-service';
import { postManualReturnCredit } from '@/services/finance/manual-return-credit-service';
import {
    prepareReturnCreditProposal,
    postProposedReturnCredit,
} from '@/services/finance/return-credit-proposal-service';
import { reverseReturnCredit } from '@/services/finance/sales-return-credit-reversal-service';
import {
    requireFinanceAccess,
    requireFinanceApprover,
} from '@/lib/auth/finance-access';
import { getUserRoles } from '@/lib/auth/roles';
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
async function requireReturnReadAccess(mutation = false) {
    const session = mutation
        ? await requireFinanceApprover()
        : await requireFinanceAccess();
    if (session.user.isSuperAdmin || !hasWorkspaceEntitlement('finance')) {
        throw new AuthorizationError();
    }
    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
            isActive: true,
            role: true,
            roles: { select: { role: true } },
        },
    });
    if (!user?.isActive) throw new AuthorizationError();
    if (mutation && !getTenantDbFromContext()) throw new AuthorizationError();
    const roles = getUserRoles({
        role: user.role,
        roles: user.roles.map((row) => row.role),
    }).filter((role): role is Role =>
        Object.values(Role).includes(role as Role),
    );
    if (!roles.some((role) => role === 'ADMIN' || role === 'FINANCE'))
        throw new AuthorizationError();
    if (roles.includes('ADMIN')) return session;
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
    return session;
}

function refreshReturnFinance(returnId: string) {
    revalidatePath('/finance/invoices/sales/[id]', 'page');
    revalidatePath('/finance/invoices/sales/[id]/print', 'page');
    revalidatePath('/sales/invoices');
    for (const path of [
        '/finance',
        '/finance/returns',
        `/finance/returns/${returnId}`,
        '/finance/invoices/sales',
        '/finance/payments/received',
        '/finance/rekap-piutang',
        '/sales/returns',
        `/sales/returns/${returnId}`,
        '/sales/collection',
        '/field/sales/receivables',
    ])
        revalidatePath(path);
}

export const postFinanceSalesReturnCredit = withTenant(
    async function postFinanceSalesReturnCredit(input: unknown) {
        return safeAction(async () => {
            const session = await requireReturnReadAccess(true);
            const result = await postReturnCredit(input, session.user.id);
            refreshReturnFinance(result.salesReturnId);
            return serializeData(result);
        });
    },
);

export const getFinanceReturnCreditProposal = withTenant(
    async function getFinanceReturnCreditProposal(returnId: string) {
        return safeAction(async () => {
            await requireReturnReadAccess();
            const db = getTenantDbFromContext();
            if (!db) throw new AuthorizationError();
            return db.$transaction((tx) =>
                prepareReturnCreditProposal(tx, returnId),
            );
        });
    },
);

export const postFinanceProposedReturnCredit = withTenant(
    async function postFinanceProposedReturnCredit(input: unknown) {
        return safeAction(async () => {
            const session = await requireReturnReadAccess(true);
            const result = await postProposedReturnCredit(
                input,
                session.user.id,
            );
            refreshReturnFinance(result.salesReturnId);
            return serializeData(result);
        });
    },
);

export const postFinanceManualSalesReturnCredit = withTenant(
    async function postFinanceManualSalesReturnCredit(input: unknown) {
        return safeAction(async () => {
            const session = await requireReturnReadAccess(true);
            const result = await postManualReturnCredit(input, session.user.id);
            refreshReturnFinance(result.salesReturnId);
            return serializeData(result);
        });
    },
);

export const reverseFinanceSalesReturnCredit = withTenant(
    async function reverseFinanceSalesReturnCredit(input: unknown) {
        return safeAction(async () => {
            const session = await requireReturnReadAccess(true);
            const result = await reverseReturnCredit(input, session.user.id);
            refreshReturnFinance(result.salesReturnId);
            return serializeData(result);
        });
    },
);

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
