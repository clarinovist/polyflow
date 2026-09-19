'use server';
import { Role } from '@prisma/client';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { withTenant } from '@/lib/core/tenant';
import { getTenantDbFromContext } from '@/lib/core/prisma';
import {
    requireFinanceAccess,
    requireFinanceApprover,
} from '@/lib/auth/finance-access';
import { getUserRoles } from '@/lib/auth/roles';
import {
    hasWorkspaceEntitlement,
    isPathAllowedByResources,
} from '@/lib/auth/access-policy';
import {
    AuthorizationError,
    BusinessRuleError,
    ValidationError,
    safeAction,
} from '@/lib/errors/errors';
import { getSalesInvoiceBalance } from '@/lib/finance/sales-return-allocation';
import { serializeData } from '@/lib/utils/utils';
import { getPriceAdjustmentSource } from '@/services/finance/invoice-price-source';
import {
    postInvoicePriceAdjustment,
    reverseInvoicePriceAdjustment,
} from '@/services/finance/invoice-price-adjustment-service';
async function access(mutation = false) {
    const session = await (mutation
        ? requireFinanceApprover()
        : requireFinanceAccess());
    const db = getTenantDbFromContext();
    if (!db || session.user.isSuperAdmin || !hasWorkspaceEntitlement('finance'))
        throw new AuthorizationError();
    const user = await db.user.findUnique({
        where: { id: session.user.id },
        select: {
            isActive: true,
            role: true,
            roles: { select: { role: true } },
        },
    });
    if (!user?.isActive) throw new AuthorizationError();
    const roles = getUserRoles({
        role: user.role,
        roles: user.roles.map((r) => r.role),
    }).filter((role): role is Role =>
        Object.values(Role).includes(role as Role),
    );
    if (!roles.some((r) => r === 'ADMIN' || r === 'FINANCE'))
        throw new AuthorizationError();
    if (!roles.includes('ADMIN')) {
        const grants = await db.rolePermission.findMany({
            where: { role: { in: roles }, canAccess: true },
            select: { resource: true },
        });
        if (
            !isPathAllowedByResources(
                '/finance/invoices/sales',
                grants.map((g) => g.resource),
            )
        )
            throw new AuthorizationError();
    }
    return { db, userId: session.user.id };
}
function refresh(invoiceId: string) {
    for (const path of [
        '/finance',
        '/finance/invoices/sales',
        `/finance/invoices/sales/${invoiceId}`,
        `/finance/invoices/sales/${invoiceId}/print`,
        '/finance/payments/received',
        '/finance/rekap-piutang',
        '/sales/invoices',
        '/sales/collection',
        '/field/sales/receivables',
    ])
        revalidatePath(path);
    revalidatePath('/finance/returns/[id]', 'page');
}
export const getInvoicePriceAdjustmentContext = withTenant(
    async function getInvoicePriceAdjustmentContext(invoiceId: string) {
        return safeAction(async () => {
            const { db } = await access();
            z.string().min(1).max(100).parse(invoiceId);
            const history = await db.invoicePriceAdjustment.findMany({
                where: { invoiceId },
                orderBy: { createdAt: 'desc' },
                take: 100,
                include: { createdBy: { select: { name: true } } },
            });
            try {
                const source = await db.$transaction((tx) =>
                    getPriceAdjustmentSource(tx, invoiceId),
                );
                return {
                    invoiceId,
                    invoiceNumber: source.invoice.invoiceNumber,
                    remaining: getSalesInvoiceBalance(source.invoice).toFixed(
                        2,
                    ),
                    sourceFingerprint: source.fingerprint,
                    sourceLabel: source.sourceLabel,
                    sourceError: null as string | null,
                    items: source.items,
                    history: serializeData(history),
                };
            } catch (error) {
                if (
                    !(
                        error instanceof BusinessRuleError ||
                        error instanceof ValidationError
                    )
                )
                    throw error;
                const invoice = await db.invoice.findUniqueOrThrow({
                    where: { id: invoiceId },
                });
                return {
                    invoiceId,
                    invoiceNumber: invoice.invoiceNumber,
                    remaining: getSalesInvoiceBalance(invoice).toFixed(2),
                    sourceFingerprint: '',
                    sourceLabel: 'Pemeriksaan sumber diperlukan',
                    sourceError: error.message,
                    items: [],
                    history: serializeData(history),
                };
            }
        });
    },
);
export const postFinanceInvoicePriceAdjustment = withTenant(
    async function postFinanceInvoicePriceAdjustment(input: unknown) {
        return safeAction(async () => {
            const { userId } = await access(true);
            const result = await postInvoicePriceAdjustment(input, userId);
            refresh(result.invoiceId);
            return serializeData(result);
        });
    },
);
export const reverseFinanceInvoicePriceAdjustment = withTenant(
    async function reverseFinanceInvoicePriceAdjustment(input: unknown) {
        return safeAction(async () => {
            const { userId } = await access(true);
            const result = await reverseInvoicePriceAdjustment(input, userId);
            refresh(result.invoiceId);
            return serializeData(result);
        });
    },
);
