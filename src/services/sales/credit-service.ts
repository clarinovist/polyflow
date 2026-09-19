import { prisma } from '@/lib/core/prisma';
import { formatRupiah } from '@/lib/utils/utils';
import { BusinessRuleError } from '@/lib/errors/errors';
import { parseTablePage, parseTablePageSize } from '@/lib/ui/table-query';
import { Prisma } from '@prisma/client';

export type CreditExposure = {
    creditLimit: number;
    unpaidInvoiceBalance: number;
    openOrderWithoutInvoice: number;
    currentExposure: number;
    headroom: number;
};

export type CustomerCreditSummary = {
    id: string;
    code: string | null;
    name: string;
    phone: string | null;
    city: string | null;
    paymentTermDays: number | null;
    creditLimit: number | null;
    isActive: boolean;
    headroom: number | null;
    exposureStatus: 'none' | 'safe' | 'near' | 'over';
};

export const CUSTOMER_CREDIT_FILTERS = [
    'all',
    'active',
    'inactive',
    'has_limit',
    'over_limit',
] as const;

export type CustomerCreditFilter = (typeof CUSTOMER_CREDIT_FILTERS)[number];

export type CustomerCreditSummaryQuery = {
    search?: string;
    filter?: CustomerCreditFilter;
    page?: number;
    pageSize?: number;
};

export type CustomerCreditSummaryPage = {
    customers: CustomerCreditSummary[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    search: string;
    filter: CustomerCreditFilter;
};

const CUSTOMER_SUMMARY_SELECT = {
    id: true,
    code: true,
    name: true,
    phone: true,
    city: true,
    paymentTermDays: true,
    creditLimit: true,
    isActive: true,
} satisfies Prisma.CustomerSelect;

const CUSTOMER_SUMMARY_ORDER = [
    { isActive: 'desc' },
    { name: 'asc' },
    { id: 'asc' },
] satisfies Prisma.CustomerOrderByWithRelationInput[];

const UNPAID_INVOICE_STATUSES = ['UNPAID', 'PARTIAL', 'OVERDUE'] as const;
const ACTIVE_ORDER_STATUSES = [
    'CONFIRMED',
    'IN_PRODUCTION',
    'READY_TO_SHIP',
    'SHIPPED',
] as const;
const CREDIT_NEAR_THRESHOLD_RATIO = new Prisma.Decimal('0.1');
const ZERO_DECIMAL = new Prisma.Decimal(0);

function asDecimal(value: Prisma.Decimal | number | string | null | undefined) {
    return value == null ? ZERO_DECIMAL : new Prisma.Decimal(value);
}

/**
 * Get customer credit exposure breakdown.
 * Returns null if customer not found or has no credit limit (limit = 0 or null).
 */
export async function getCustomerCreditExposure(
    customerId: string,
): Promise<CreditExposure | null> {
    const customer = await prisma.customer.findUnique({
        where: { id: customerId },
        select: { creditLimit: true },
    });

    if (!customer) return null;

    const creditLimit = asDecimal(customer.creditLimit);
    if (creditLimit.lte(0)) return null;

    // 1. Unpaid + partial invoice balance
    const unpaidInvoices = await prisma.invoice.findMany({
        where: {
            salesOrder: { customerId },
            status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] },
        },
        select: { totalAmount: true, paidAmount: true, creditedAmount: true, priceAdjustmentAmount: true },
    });

    const unpaidInvoiceBalance = unpaidInvoices.reduce(
        (sum, invoice) =>
            sum.plus(invoice.totalAmount).plus(invoice.priceAdjustmentAmount ?? 0).minus(invoice.paidAmount).minus(invoice.creditedAmount ?? 0),
        ZERO_DECIMAL,
    );

    // 2. Active SO without invoice (incl. shippingCost)
    const activeOrders = await prisma.salesOrder.findMany({
        where: {
            customerId,
            status: {
                in: ['CONFIRMED', 'IN_PRODUCTION', 'READY_TO_SHIP', 'SHIPPED'],
            },
            invoices: { none: {} },
        },
        select: { totalAmount: true },
    });

    const openOrderWithoutInvoice = activeOrders.reduce(
        (sum, order) => sum.plus(asDecimal(order.totalAmount)),
        ZERO_DECIMAL,
    );

    const currentExposure = unpaidInvoiceBalance.plus(openOrderWithoutInvoice);
    const headroom = creditLimit.minus(currentExposure);

    return {
        creditLimit: creditLimit.toNumber(),
        unpaidInvoiceBalance: unpaidInvoiceBalance.toNumber(),
        openOrderWithoutInvoice: openOrderWithoutInvoice.toNumber(),
        currentExposure: currentExposure.toNumber(),
        headroom: headroom.toNumber(),
    };
}

/**
 * Check credit limit before create/update/confirm SO.
 * Throws BusinessRuleError with Indonesian message if exceeded.
 */
export async function checkCreditLimit(
    customerId: string,
    newAmount: number,
    _options?: { includeShippingInNewAmount?: boolean },
): Promise<void> {
    const exposure = await getCustomerCreditExposure(customerId);
    if (!exposure) return; // no limit set — skip check

    const newExposure = exposure.currentExposure + newAmount;

    if (newExposure > exposure.creditLimit) {
        throw new BusinessRuleError(
            `Batas kredit terlampaui. Limit: ${formatRupiah(exposure.creditLimit)}, Exposure: ${formatRupiah(exposure.currentExposure)}, Baru: ${formatRupiah(newAmount)}`,
            {
                creditLimit: exposure.creditLimit,
                currentExposure: exposure.currentExposure,
                newAmount,
                headroom: exposure.headroom,
            },
            'CREDIT_LIMIT_EXCEEDED',
        );
    }
}

function normalizeSummaryQuery(
    query: CustomerCreditSummaryQuery,
): Required<CustomerCreditSummaryQuery> {
    const search =
        typeof query.search === 'string'
            ? query.search.trim().slice(0, 100)
            : '';
    const filter = CUSTOMER_CREDIT_FILTERS.includes(
        query.filter as CustomerCreditFilter,
    )
        ? (query.filter as CustomerCreditFilter)
        : 'all';

    return {
        search,
        filter,
        page: parseTablePage(query.page),
        pageSize: parseTablePageSize(query.pageSize),
    };
}

function buildCustomerWhere(
    search: string,
    filter: Exclude<CustomerCreditFilter, 'over_limit'>,
): Prisma.CustomerWhereInput {
    const filterWhere: Prisma.CustomerWhereInput =
        filter === 'active'
            ? { isActive: true }
            : filter === 'inactive'
              ? { isActive: false }
              : filter === 'has_limit'
                ? { creditLimit: { gt: 0 } }
                : {};
    const searchWhere: Prisma.CustomerWhereInput = search
        ? {
              OR: [
                  { name: { contains: search, mode: 'insensitive' } },
                  { code: { contains: search, mode: 'insensitive' } },
                  { phone: { contains: search, mode: 'insensitive' } },
              ],
          }
        : {};

    return { ...filterWhere, ...searchWhere };
}

type OverLimitPageRow = {
    id: string | null;
    total: number | bigint;
};

async function queryOverLimitCustomerIds(
    search: string,
    page: number,
    pageSize: number,
): Promise<{ ids: string[]; total: number }> {
    const searchPattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
    const searchSql = search
        ? Prisma.sql`AND (
              c.name ILIKE ${searchPattern} ESCAPE E'\\\\'
              OR COALESCE(c.code, '') ILIKE ${searchPattern} ESCAPE E'\\\\'
              OR COALESCE(c.phone, '') ILIKE ${searchPattern} ESCAPE E'\\\\'
          )`
        : Prisma.empty;
    const offset = (page - 1) * pageSize;
    const rows = await prisma.$queryRaw<OverLimitPageRow[]>(Prisma.sql`
        WITH invoice_exposure AS (
            SELECT so."customerId", SUM(i."totalAmount" + i."priceAdjustmentAmount" - i."paidAmount" - i."creditedAmount") AS amount
            FROM "Invoice" i
            JOIN "SalesOrder" so ON so.id = i."salesOrderId"
            WHERE i.status IN ('UNPAID', 'PARTIAL', 'OVERDUE')
            GROUP BY so."customerId"
        ), order_exposure AS (
            SELECT so."customerId", SUM(COALESCE(so."totalAmount", 0)) AS amount
            FROM "SalesOrder" so
            WHERE so.status IN ('CONFIRMED', 'IN_PRODUCTION', 'READY_TO_SHIP', 'SHIPPED')
              AND NOT EXISTS (
                  SELECT 1 FROM "Invoice" i WHERE i."salesOrderId" = so.id
              )
            GROUP BY so."customerId"
        ), matching AS (
            SELECT c.id, c."isActive", c.name
            FROM "Customer" c
            LEFT JOIN invoice_exposure ie ON ie."customerId" = c.id
            LEFT JOIN order_exposure oe ON oe."customerId" = c.id
            WHERE c."creditLimit" IS NOT NULL
              AND c."creditLimit" > 0
              AND COALESCE(ie.amount, 0) + COALESCE(oe.amount, 0) > c."creditLimit"
              ${searchSql}
        ), paged AS (
            SELECT id
            FROM matching
            ORDER BY "isActive" DESC, name ASC, id ASC
            OFFSET ${offset}
            LIMIT ${pageSize}
        )
        SELECT paged.id, totals.total
        FROM (SELECT COUNT(*)::int AS total FROM matching) totals
        LEFT JOIN paged ON TRUE
    `);

    return {
        ids: rows.flatMap((row) => (row.id ? [row.id] : [])),
        total: Number(rows[0]?.total ?? 0),
    };
}

async function getCustomerIdPage(
    query: Required<CustomerCreditSummaryQuery>,
): Promise<{ ids: string[]; total: number; page: number }> {
    if (query.filter === 'over_limit') {
        const firstResult = await queryOverLimitCustomerIds(
            query.search,
            query.page,
            query.pageSize,
        );
        const totalPages = Math.ceil(firstResult.total / query.pageSize);
        const page = Math.min(query.page, Math.max(totalPages, 1));
        return page === query.page
            ? { ...firstResult, page }
            : {
                  ...(await queryOverLimitCustomerIds(
                      query.search,
                      page,
                      query.pageSize,
                  )),
                  page,
              };
    }

    const where = buildCustomerWhere(query.search, query.filter);
    const total = await prisma.customer.count({ where });
    const totalPages = Math.ceil(total / query.pageSize);
    const page = Math.min(query.page, Math.max(totalPages, 1));
    const rows = await prisma.customer.findMany({
        where,
        select: { id: true },
        orderBy: CUSTOMER_SUMMARY_ORDER,
        skip: (page - 1) * query.pageSize,
        take: query.pageSize,
    });

    return { ids: rows.map((row) => row.id), total, page };
}

function summarizeCustomer(
    customer: Prisma.CustomerGetPayload<{
        select: typeof CUSTOMER_SUMMARY_SELECT;
    }>,
    invoiceBalance: Prisma.Decimal,
    openOrderBalance: Prisma.Decimal,
): CustomerCreditSummary {
    const creditLimit = asDecimal(customer.creditLimit);
    const currentExposure = invoiceBalance.plus(openOrderBalance);
    const hasCreditLimit = creditLimit.gt(0);
    const headroom = hasCreditLimit ? creditLimit.minus(currentExposure) : null;
    const exposureStatus: CustomerCreditSummary['exposureStatus'] =
        !hasCreditLimit
            ? 'none'
            : currentExposure.gt(creditLimit)
              ? 'over'
              : headroom !== null &&
                  headroom.lt(creditLimit.times(CREDIT_NEAR_THRESHOLD_RATIO))
                ? 'near'
                : 'safe';

    return {
        ...customer,
        creditLimit: customer.creditLimit == null ? null : creditLimit.toNumber(),
        headroom: headroom?.toNumber() ?? null,
        exposureStatus,
    };
}

async function calculatePageSummaries(
    customerIds: string[],
): Promise<CustomerCreditSummary[]> {
    if (customerIds.length === 0) return [];

    const [customers, invoices, openOrders] = await Promise.all([
        prisma.customer.findMany({
            where: { id: { in: customerIds } },
            select: CUSTOMER_SUMMARY_SELECT,
        }),
        prisma.invoice.findMany({
            where: {
                salesOrder: { customerId: { in: customerIds } },
                status: { in: [...UNPAID_INVOICE_STATUSES] },
            },
            select: {
                totalAmount: true,
                paidAmount: true,
                creditedAmount: true,
                priceAdjustmentAmount: true,
                salesOrder: { select: { customerId: true } },
            },
        }),
        prisma.salesOrder.groupBy({
            by: ['customerId'],
            where: {
                customerId: { in: customerIds },
                status: { in: [...ACTIVE_ORDER_STATUSES] },
                invoices: { none: {} },
            },
            _sum: { totalAmount: true },
        }),
    ]);

    const customerById = Object.fromEntries(
        customers.map((customer) => [customer.id, customer]),
    );
    const invoiceBalanceByCustomer = new Map<string, Prisma.Decimal>();
    for (const invoice of invoices) {
        const customerId = invoice.salesOrder.customerId;
        if (!customerId) continue;
        const balance = invoice.totalAmount.plus(invoice.priceAdjustmentAmount ?? 0).minus(invoice.paidAmount).minus(invoice.creditedAmount ?? 0);
        invoiceBalanceByCustomer.set(
            customerId,
            (invoiceBalanceByCustomer.get(customerId) ?? ZERO_DECIMAL).plus(
                balance,
            ),
        );
    }
    const openOrderByCustomer = new Map<string, Prisma.Decimal>();
    for (const row of openOrders) {
        if (row.customerId) {
            openOrderByCustomer.set(
                row.customerId,
                asDecimal(row._sum.totalAmount),
            );
        }
    }

    return customerIds.flatMap((customerId) => {
        const customer = customerById[customerId];
        return customer
            ? [
                  summarizeCustomer(
                      customer,
                      invoiceBalanceByCustomer.get(customerId) ?? ZERO_DECIMAL,
                      openOrderByCustomer.get(customerId) ?? ZERO_DECIMAL,
                  ),
              ]
            : [];
    });
}

/**
 * Get one bounded customer directory page and calculate credit exposure only
 * for customers included on that page.
 */
export async function getCustomersWithCreditSummary(
    input: CustomerCreditSummaryQuery = {},
): Promise<CustomerCreditSummaryPage> {
    const query = normalizeSummaryQuery(input);
    const idPage = await getCustomerIdPage(query);
    const customers = await calculatePageSummaries(idPage.ids);

    return {
        customers,
        total: idPage.total,
        page: idPage.page,
        pageSize: query.pageSize,
        totalPages: Math.ceil(idPage.total / query.pageSize),
        search: query.search,
        filter: query.filter,
    };
}
