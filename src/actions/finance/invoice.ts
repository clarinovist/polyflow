'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { InvoiceStatus, Prisma } from '@prisma/client';
import {
    requireFinanceAccess,
    requireFinanceMutation,
    requireFinanceReadCrossPortal,
} from '@/lib/auth/finance-access';
import { positiveSalesReceivableWhere } from '@/services/finance/sales-receivable-query';
import { InvoiceService } from '@/services/finance/invoice-service';
import {
    createInvoiceSchema,
    updateInvoiceStatusSchema,
    CreateInvoiceValues,
} from '@/lib/schemas/invoice';
import { revalidatePath } from 'next/cache';
import { serializeData } from '@/lib/utils/utils';
import { logger } from '@/lib/config/logger';
import { getWibDayBounds, toBusinessDateString } from '@/lib/utils/timezone';
import {
    safeAction,
    BusinessRuleError,
    ValidationError,
} from '@/lib/errors/errors';

export const getInvoices = withTenant(async function getInvoices(
    dateRange?: { startDate?: Date; endDate?: Date },
    demandType?: 'customer' | 'legacy-internal',
) {
    return safeAction(async () => {
        await requireFinanceAccess();
        const where: Prisma.InvoiceWhereInput = {};
        if (dateRange?.startDate && dateRange?.endDate) {
            where.invoiceDate = {
                gte: dateRange.startDate,
                lte: dateRange.endDate,
            };
        }

        if (demandType === 'customer') {
            where.salesOrder = {
                customerId: { not: null },
            };
        } else if (demandType === 'legacy-internal') {
            where.salesOrder = {
                customerId: null,
            };
        }

        const invoices = await prisma.invoice.findMany({
            where,
            include: {
                salesOrder: {
                    select: {
                        orderNumber: true,
                        customer: { select: { name: true } },
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
        return serializeData(invoices);
    });
});

const FINANCE_SALES_INVOICE_SORT_KEYS = [
    'invoiceDate',
    'entity',
    'status',
    'totalAmount',
] as const;
type FinanceSalesInvoiceSortKey =
    (typeof FINANCE_SALES_INVOICE_SORT_KEYS)[number];
type FinanceSalesInvoiceSortDirection = 'asc' | 'desc';

interface FinanceSalesInvoicePageParams {
    page?: number;
    pageSize?: number;
    search?: string;
    startDate?: Date;
    endDate?: Date;
    demandType?: 'customer' | 'legacy-internal';
    status?: InvoiceStatus;
    overdue?: boolean;
    sort?: FinanceSalesInvoiceSortKey;
    direction?: FinanceSalesInvoiceSortDirection;
}

function normalizePositiveInteger(value: number | undefined, fallback: number) {
    if (!Number.isFinite(value) || value === undefined || value < 1) {
        return fallback;
    }
    return Math.floor(value);
}

function normalizeFinanceSalesInvoiceSort(
    sort: FinanceSalesInvoiceSortKey | undefined,
    direction: FinanceSalesInvoiceSortDirection | undefined,
) {
    const normalizedSort = FINANCE_SALES_INVOICE_SORT_KEYS.includes(
        sort as FinanceSalesInvoiceSortKey,
    )
        ? (sort as FinanceSalesInvoiceSortKey)
        : 'invoiceDate';
    const normalizedDirection =
        direction === 'asc' || direction === 'desc' ? direction : 'desc';

    return { sort: normalizedSort, direction: normalizedDirection };
}

function buildFinanceSalesInvoiceOrderBy(
    sort: FinanceSalesInvoiceSortKey,
    direction: FinanceSalesInvoiceSortDirection,
): Prisma.InvoiceOrderByWithRelationInput[] {
    const primary: Prisma.InvoiceOrderByWithRelationInput =
        sort === 'entity'
            ? { salesOrder: { customer: { name: direction } } }
            : { [sort]: direction };
    return [primary, { id: direction }];
}

function buildFinanceSalesInvoiceWhere(
    params: FinanceSalesInvoicePageParams,
): Prisma.InvoiceWhereInput {
    const search = params.search?.trim();
    const overdue = params.overdue || params.status === InvoiceStatus.OVERDUE;
    const filters: Prisma.InvoiceWhereInput[] = [];

    if (params.startDate || params.endDate) {
        filters.push({
            invoiceDate: {
                ...(params.startDate ? { gte: params.startDate } : {}),
                ...(params.endDate ? { lte: params.endDate } : {}),
            },
        });
    }
    if (params.demandType === 'customer') {
        filters.push({ salesOrder: { customerId: { not: null } } });
    } else if (params.demandType === 'legacy-internal') {
        filters.push({ salesOrder: { customerId: null } });
    }
    if (overdue) {
        const currentBusinessDayStart = getWibDayBounds(
            toBusinessDateString(new Date()),
        ).startOfDay;
        filters.push({
            dueDate: { lt: currentBusinessDayStart },
            status: {
                in: [
                    InvoiceStatus.UNPAID,
                    InvoiceStatus.PARTIAL,
                    InvoiceStatus.OVERDUE,
                ],
            },
        });
    } else if (params.status) {
        filters.push({ status: params.status });
    }
    if (search) {
        filters.push({
            OR: [
                { invoiceNumber: { contains: search, mode: 'insensitive' } },
                {
                    salesOrder: {
                        orderNumber: { contains: search, mode: 'insensitive' },
                    },
                },
                {
                    salesOrder: {
                        customer: {
                            name: { contains: search, mode: 'insensitive' },
                        },
                    },
                },
            ],
        });
    }

    return filters.length > 0 ? { AND: filters } : {};
}

export const getFinanceSalesInvoicePage = withTenant(
    async function getFinanceSalesInvoicePage(
        params: FinanceSalesInvoicePageParams = {},
    ) {
        return safeAction(async () => {
            await requireFinanceAccess();
            const page = normalizePositiveInteger(params.page, 1);
            const pageSize = Math.min(
                normalizePositiveInteger(params.pageSize, 50),
                100,
            );
            const baseWhere = buildFinanceSalesInvoiceWhere(params);
            const where: Prisma.InvoiceWhereInput = params.overdue || ['UNPAID', 'PARTIAL', 'OVERDUE'].includes(params.status ?? '')
                ? { AND: [baseWhere, await positiveSalesReceivableWhere()] } : baseWhere;
            const { sort, direction } = normalizeFinanceSalesInvoiceSort(
                params.sort,
                params.direction,
            );
            const total = await prisma.invoice.count({ where });
            const totalPages = Math.ceil(total / pageSize);
            const clampedPage = Math.min(page, Math.max(1, totalPages));
            const invoices = await prisma.invoice.findMany({
                where,
                include: {
                    salesOrder: {
                        select: {
                            orderNumber: true,
                            customer: { select: { name: true } },
                        },
                    },
                },
                orderBy: buildFinanceSalesInvoiceOrderBy(sort, direction),
                skip: (clampedPage - 1) * pageSize,
                take: pageSize,
            });

            return serializeData({
                data: invoices,
                meta: {
                    page: clampedPage,
                    pageSize,
                    total,
                    totalPages,
                },
            });
        });
    },
);

export const getInvoiceById = withTenant(async function getInvoiceById(
    id: string,
) {
    return safeAction(async () => {
        await requireFinanceAccess();
        const invoice = await prisma.invoice.findUnique({
            where: { id },
            include: {
                salesOrder: {
                    include: {
                        customer: true,
                        items: {
                            include: {
                                productVariant: {
                                    include: { product: true },
                                },
                            },
                        },
                    },
                },
            },
        });
        return serializeData(invoice);
    });
});

export const createInvoice = withTenant(async function createInvoice(
    data: CreateInvoiceValues,
) {
    return safeAction(async () => {
        const session = await requireFinanceMutation();
        const result = createInvoiceSchema.safeParse(data);

        if (!result.success) {
            throw new ValidationError(result.error.issues[0].message);
        }

        try {
            const invoice = await InvoiceService.createInvoice(
                result.data,
                session.user.id,
            );

            revalidatePath('/sales'); // Refresh sales to update invoice status if any
            revalidatePath(`/sales/orders/${data.salesOrderId}`);
            return serializeData(invoice);
        } catch (error) {
            logger.error('Failed to create invoice', {
                error,
                module: 'InvoiceActions',
            });
            if (
                error instanceof Error &&
                /Sales Order not found|Sales Order has no total amount|without customer/i.test(
                    error.message,
                )
            ) {
                throw new BusinessRuleError(error.message);
            }
            throw new BusinessRuleError(
                'Failed to create invoice. Please try again.',
            );
        }
    });
});

export const updateInvoiceStatus = withTenant(
    async function updateInvoiceStatus(data: {
        id: string;
        status: InvoiceStatus;
        paidAmount?: number;
    }) {
        return safeAction(async () => {
            const session = await requireFinanceMutation();
            const result = updateInvoiceStatusSchema.safeParse(data);

            if (!result.success) {
                throw new ValidationError(result.error.issues[0].message);
            }

            await InvoiceService.updateStatus(result.data, session.user.id);
            revalidatePath('/sales');
            const invoice = await prisma.invoice.findUnique({
                where: { id: data.id },
                select: { salesOrderId: true },
            });
            if (invoice) {
                revalidatePath(`/sales/orders/${invoice.salesOrderId}`);
            }

            return { success: true };
        });
    },
);

export const getOutstandingInvoicesByCustomerId = withTenant(
    async function getOutstandingInvoicesByCustomerId(customerId: string) {
        return safeAction(async () => {
            await requireFinanceReadCrossPortal([
                'SALES',
                'MARKETING',
                'FIELD_SALES',
            ]);
            const invoices = await prisma.invoice.findMany({
                where: {
                    ...(await positiveSalesReceivableWhere()),
                    salesOrder: {
                        customerId: customerId,
                    },
                    status: {
                        in: [
                            InvoiceStatus.UNPAID,
                            InvoiceStatus.PARTIAL,
                            InvoiceStatus.OVERDUE,
                        ],
                    },
                },
                include: {
                    salesOrder: {
                        select: {
                            orderNumber: true,
                        },
                    },
                },
                orderBy: {
                    dueDate: 'asc',
                },
            });
            return serializeData(invoices);
        });
    },
);

export const updateSalesInvoiceDueDate = withTenant(
    async function updateSalesInvoiceDueDate(
        id: string,
        data: {
            dueDate?: Date | string;
            termOfPaymentDays?: number;
            invoiceDate?: Date | string;
        },
    ) {
        return safeAction(async () => {
            const session = await requireFinanceMutation();
            const parsed = {
                dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
                invoiceDate: data.invoiceDate
                    ? new Date(data.invoiceDate)
                    : undefined,
                termOfPaymentDays: data.termOfPaymentDays,
            };
            const updated = await InvoiceService.updateSalesInvoiceDueDate(
                id,
                parsed,
                session.user.id,
            );
            revalidatePath('/finance/invoices/sales');
            revalidatePath(`/finance/invoices/sales/${id}`);
            revalidatePath('/sales/orders');
            return serializeData(updated);
        });
    },
);
