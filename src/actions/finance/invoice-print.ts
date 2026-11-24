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

/** Same shape the finance print page reads through getInvoiceById. */
const INVOICE_PRINT_INCLUDE = {
    salesOrder: {
        include: {
            customer: true,
            items: {
                include: {
                    productVariant: { include: { product: true } },
                },
            },
        },
    },
} satisfies Prisma.InvoiceInclude;

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
                include: INVOICE_PRINT_INCLUDE,
            });
            return serializeData(invoice);
        });
    },
);
