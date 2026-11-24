'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import type { Prisma } from '@prisma/client';
import { requireFinanceReadCrossPortal } from '@/lib/auth/finance-access';
import { buildOperationalSalesReceivableOrderWhere } from '@/lib/sales/operational-receivables';
import { serializeData } from '@/lib/utils/utils';
import { safeAction } from '@/lib/errors/errors';

/** Sales-side roles that may print an invoice (ADMIN and FINANCE are always allowed). */
const INVOICE_PRINT_ROLES = ['SALES', 'MARKETING'];

/**
 * Explicit field list for the sales-portal print page.
 *
 * The print template renders line items from `commercialSnapshot` and only
 * needs the customer header from the live order. Never `include` whole
 * relations here: this action is open to roles without finance access, and
 * the page hands the result to a client component, so every selected column
 * (e.g. variant buyPrice / standardCost) would reach the browser.
 */
const INVOICE_PRINT_SELECT = {
    id: true,
    invoiceNumber: true,
    invoiceDate: true,
    dueDate: true,
    status: true,
    totalAmount: true,
    paidAmount: true,
    creditedAmount: true,
    priceAdjustmentAmount: true,
    commercialSnapshot: true,
    salesOrder: {
        select: {
            orderNumber: true,
            customer: {
                select: {
                    name: true,
                    phone: true,
                    email: true,
                    billingAddress: true,
                    shippingAddress: true,
                    taxId: true,
                },
            },
        },
    },
} satisfies Prisma.InvoiceSelect;

/**
 * Read-only invoice lookup for the sales-portal print page.
 *
 * Scope matches the /sales/invoices list (operational receivables with a
 * customer). An invoice outside that scope resolves to null so the page can
 * answer 404 instead of leaking historical or internal documents.
 */
export const getSalesInvoiceForPrint = withTenant(
    async function getSalesInvoiceForPrint(id: string) {
        return safeAction(async () => {
            await requireFinanceReadCrossPortal(INVOICE_PRINT_ROLES);
            const invoice = await prisma.invoice.findFirst({
                where: {
                    id,
                    salesOrder: buildOperationalSalesReceivableOrderWhere(),
                },
                select: INVOICE_PRINT_SELECT,
            });
            return serializeData(invoice);
        });
    },
);
