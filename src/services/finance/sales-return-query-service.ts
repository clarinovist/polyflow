import { Prisma, SalesReturnStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/core/prisma';

const pageInput = z.object({
    page: z.coerce
        .number()
        .int()
        .positive()
        .max(Number.MAX_SAFE_INTEGER)
        .default(1),
    status: z.nativeEnum(SalesReturnStatus).optional(),
    search: z.string().trim().max(100).optional(),
});
const PAGE_SIZE = 25;
const returnSelect = {
    id: true,
    returnNumber: true,
    returnDate: true,
    status: true,
    totalAmount: true,
    customer: { select: { name: true } },
    salesOrder: { select: { orderNumber: true } },
} satisfies Prisma.SalesReturnSelect;

/** Snapshot of operational work, never an amount of posted financial credit. */
export async function getFinanceReturnSummary() {
    const groups = await prisma.salesReturn.groupBy({
        by: ['status'],
        where: { status: { in: ['DRAFT', 'CONFIRMED', 'RECEIVED'] } },
        _count: { _all: true },
        _sum: { totalAmount: true },
    });
    const countFor = (status: SalesReturnStatus) =>
        groups.find((group) => group.status === status)?._count._all ?? 0;
    return {
        draftCount: countFor('DRAFT'),
        confirmedCount: countFor('CONFIRMED'),
        receivedCount: countFor('RECEIVED'),
        count: groups.reduce((sum, group) => sum + group._count._all, 0),
        documentAmount: groups.reduce(
            (sum, group) => sum + Number(group._sum.totalAmount ?? 0),
            0,
        ),
    };
}

/** Call only within tenant context after Finance authorization. No financial mutations. */
export async function getFinanceReturnPage(input: unknown) {
    const params = pageInput.parse(input);
    const where: Prisma.SalesReturnWhereInput = {
        ...(params.status ? { status: params.status } : {}),
        ...(params.search
            ? {
                  OR: [
                      {
                          returnNumber: {
                              contains: params.search,
                              mode: 'insensitive' as const,
                          },
                      },
                      {
                          customer: {
                              name: {
                                  contains: params.search,
                                  mode: 'insensitive' as const,
                              },
                          },
                      },
                      {
                          salesOrder: {
                              orderNumber: {
                                  contains: params.search,
                                  mode: 'insensitive' as const,
                              },
                          },
                      },
                  ],
              }
            : {}),
    };
    const total = await prisma.salesReturn.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const page = Math.min(params.page, totalPages);
    const rows = await prisma.salesReturn.findMany({
        where,
        select: returnSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: PAGE_SIZE,
        skip: (page - 1) * PAGE_SIZE,
    });
    return {
        rows: rows.map((row) => ({
            ...row,
            returnDate: row.returnDate.toISOString(),
            totalAmount: Number(row.totalAmount ?? 0),
        })),
        page,
        totalPages,
        total,
    };
}

export async function getFinanceReturnDetail(input: unknown) {
    const id = z.string().trim().min(1).max(100).parse(input);
    const row = await prisma.salesReturn.findUnique({
        where: { id },
        select: {
            ...returnSelect,
            reason: true,
            notes: true,
            deliveryOrder: { select: { orderNumber: true } },
            returnLocation: { select: { name: true } },
            items: {
                orderBy: { id: 'asc' },
                select: {
                    id: true,
                    returnedQty: true,
                    unitPrice: true,
                    condition: true,
                    productVariant: { select: { skuCode: true, name: true } },
                },
            },
        },
    });
    if (!row) return null;
    return {
        ...row,
        returnDate: row.returnDate.toISOString(),
        totalAmount: Number(row.totalAmount ?? 0),
        items: row.items.map((item) => ({
            ...item,
            returnedQty: Number(item.returnedQty),
            unitPrice: Number(item.unitPrice),
        })),
    };
}

export type FinanceReturnSummary = Awaited<
    ReturnType<typeof getFinanceReturnSummary>
>;
export type FinanceReturnPage = Awaited<
    ReturnType<typeof getFinanceReturnPage>
>;
export type FinanceReturnDetail = NonNullable<
    Awaited<ReturnType<typeof getFinanceReturnDetail>>
>;
