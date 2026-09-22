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
    getQuickReturnOrders,
    getQuickReturnOrderItems,
    previewQuickSalesReturn,
    postQuickSalesReturn,
} from '@/services/finance/quick-sales-return-service';
import {
    requireFinanceAccess,
    requireFinanceApprover,
    requireFinanceAdmin,
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

import { issueCustomerCredit } from '@/services/finance/customer-credit-issue-service';
import {
    applyCustomerCredit,
    reverseCustomerCreditApplication,
    reverseCustomerCreditNote,
} from '@/services/finance/customer-credit-application-service';
import {
    approveCustomerCreditLink,
    revokeCustomerCreditLink,
} from '@/services/finance/customer-credit-link-service';
import {
    getCustomerCredits,
    getCustomerCreditDetail,
    getCustomerCreditTargets,
    searchCreditCustomers,
} from '@/services/finance/customer-credit-query-service';

/** Fresh resource check: direct action calls must not bypass the Finance layout. */
async function requireReturnReadAccess(mutation = false, admin = false) {
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
    if (admin && !roles.includes('ADMIN'))
        throw new AuthorizationError(
            'Verifikasi identitas kredit hanya untuk Admin aktif.',
        );
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
    revalidatePath('/finance/returns/credits/[id]', 'page');
    revalidatePath('/finance/journals');
    for (const path of [
        '/finance',
        '/finance/returns',
        '/finance/returns/credits',
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

export const getFinanceQuickReturnOrders = withTenant(
    async function getFinanceQuickReturnOrders(search: unknown = '') {
        return safeAction(async () => {
            await requireReturnReadAccess();
            return getQuickReturnOrders(search);
        });
    },
);

export const getFinanceQuickReturnItems = withTenant(
    async function getFinanceQuickReturnItems(orderId: unknown) {
        return safeAction(async () => {
            await requireReturnReadAccess();
            return getQuickReturnOrderItems(orderId);
        });
    },
);

export const previewFinanceQuickReturn = withTenant(
    async function previewFinanceQuickReturn(input: unknown) {
        return safeAction(async () => {
            await requireReturnReadAccess();
            return previewQuickSalesReturn(input);
        });
    },
);

export const postFinanceQuickReturn = withTenant(
    async function postFinanceQuickReturn(input: unknown) {
        return safeAction(async () => {
            const session = await requireReturnReadAccess(true);
            const result = await postQuickSalesReturn(input, session.user.id);
            refreshReturnFinance(result.id);
            revalidatePath('/warehouse/inventory');
            revalidatePath('/warehouse/stock-movements');
            revalidatePath('/finance/journals');
            revalidatePath('/sales/orders/[id]', 'page');
            return result;
        });
    },
);

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

export const issueFinanceCustomerCredit = withTenant(
    async function issueFinanceCustomerCredit(input: unknown) {
        return safeAction(async () => {
            const session = await requireReturnReadAccess(true);
            const result = await issueCustomerCredit(input, session.user.id);
            refreshReturnFinance(result.returnId);
            return result;
        });
    },
);
export const applyFinanceCustomerCredit = withTenant(
    async function applyFinanceCustomerCredit(input: unknown) {
        return safeAction(async () => {
            const session = await requireReturnReadAccess(true);
            const result = await applyCustomerCredit(input, session.user.id);
            refreshReturnFinance(result.returnId);
            return result;
        });
    },
);
export const reverseFinanceCustomerCreditApplication = withTenant(
    async function reverseFinanceCustomerCreditApplication(input: unknown) {
        return safeAction(async () => {
            const session = await requireReturnReadAccess(true);
            const result = await reverseCustomerCreditApplication(
                input,
                session.user.id,
            );
            refreshReturnFinance(result.returnId);
            return result;
        });
    },
);
export const reverseFinanceCustomerCreditNote = withTenant(
    async function reverseFinanceCustomerCreditNote(input: unknown) {
        return safeAction(async () => {
            const session = await requireReturnReadAccess(true);
            const result = await reverseCustomerCreditNote(
                input,
                session.user.id,
            );
            refreshReturnFinance(result.returnId);
            return result;
        });
    },
);
export const approveFinanceCustomerCreditLink = withTenant(
    async function approveFinanceCustomerCreditLink(input: unknown) {
        return safeAction(async () => {
            const session = await requireReturnReadAccess(true, true);
            await requireFinanceAdmin();
            const result = await approveCustomerCreditLink(
                input,
                session.user.id,
            );
            revalidatePath('/finance/returns/credits/[id]', 'page');
            return result;
        });
    },
);
export const revokeFinanceCustomerCreditLink = withTenant(
    async function revokeFinanceCustomerCreditLink(input: unknown) {
        return safeAction(async () => {
            const session = await requireReturnReadAccess(true, true);
            await requireFinanceAdmin();
            const result = await revokeCustomerCreditLink(
                input,
                session.user.id,
            );
            revalidatePath('/finance/returns/credits/[id]', 'page');
            return result;
        });
    },
);
export const getFinanceCustomerCredits = withTenant(
    async function getFinanceCustomerCredits(input: unknown = {}) {
        return safeAction(async () => {
            await requireReturnReadAccess();
            return getCustomerCredits(input);
        });
    },
);
export const getFinanceCustomerCreditDetail = withTenant(
    async function getFinanceCustomerCreditDetail(id: string) {
        return safeAction(async () => {
            await requireReturnReadAccess();
            return getCustomerCreditDetail(id);
        });
    },
);
export const getFinanceCustomerCreditTargets = withTenant(
    async function getFinanceCustomerCreditTargets(input: unknown) {
        return safeAction(async () => {
            await requireReturnReadAccess();
            return getCustomerCreditTargets(input);
        });
    },
);
export const searchFinanceCreditCustomers = withTenant(
    async function searchFinanceCreditCustomers(input: unknown) {
        return safeAction(async () => {
            await requireReturnReadAccess(false, true);
            await requireFinanceAdmin();
            return searchCreditCustomers(input);
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
