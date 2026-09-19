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
    credit: { select: { status: true, totalAmount: true, reviewReason: true } },
} satisfies Prisma.SalesReturnSelect;

/** Snapshot of operational work, never an amount of posted financial credit. */
export async function getFinanceReturnSummary() {
    const groups = await prisma.salesReturn.groupBy({
        by: ['status'],
        where: {
            OR: [
                { status: { in: ['DRAFT', 'CONFIRMED'] } },
                {
                    status: { in: ['RECEIVED', 'COMPLETED'] },
                    OR: [
                        { credit: { is: null } },
                        { credit: { status: { not: 'POSTED' } } },
                    ],
                },
            ],
        },
        _count: { _all: true },
        _sum: { totalAmount: true },
    });
    const countFor = (status: SalesReturnStatus) =>
        groups.find((group) => group.status === status)?._count._all ?? 0;
    return {
        draftCount: countFor('DRAFT'),
        confirmedCount: countFor('CONFIRMED'),
        receivedCount: countFor('RECEIVED') + countFor('COMPLETED'),
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
            credit: row.credit
                ? { ...row.credit, totalAmount: Number(row.credit.totalAmount) }
                : null,
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
            salesOrderId: true,
            credit: {
                select: {
                    status: true,
                    reviewReason: true,
                    mode: true,
                    approvalReason: true,
                    evidenceReference: true,
                    approvedAt: true,
                    approvedBy: { select: { name: true, email: true } },
                    manualRemainingBefore: true,
                    taxAmount: true,
                    totalAmount: true,
                    postedAt: true,
                    reversedAt: true,
                    reversalReason: true,
                    allocations: {
                        select: {
                            quantity: true,
                            totalAmount: true,
                            invoice: { select: { invoiceNumber: true } },
                        },
                    },
                },
            },
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
                    productVariantId: true,
                    receipt: {
                        select: {
                            sourceMovementId: true,
                            quantity: true,
                            restockValue: true,
                        },
                    },
                    productVariant: { select: { skuCode: true, name: true } },
                },
            },
        },
    });
    if (!row) return null;
    const invoices = await prisma.invoice.findMany({
        where: { salesOrderId: row.salesOrderId, status: { not: 'CANCELLED' } },
        select: {
            id: true,
            invoiceNumber: true,
            status: true,
            totalAmount: true,
            paidAmount: true,
            creditedAmount: true,
            priceAdjustmentAmount: true,
            returnBasisLines: {
                include: {
                    allocations: {
                        where: { credit: { status: 'POSTED' } },
                        select: { quantity: true },
                    },
                },
            },
        },
        orderBy: [{ invoiceDate: 'asc' }, { id: 'asc' }],
    });
    return {
        ...row,
        returnDate: row.returnDate.toISOString(),
        totalAmount: Number(row.totalAmount ?? 0),
        credit: row.credit
            ? {
                  status: row.credit.status,
                  mode: row.credit.mode,
                  approvalReason: row.credit.approvalReason,
                  evidenceReference: row.credit.evidenceReference,
                  approvedAt: row.credit.approvedAt?.toISOString() ?? null,
                  approvedBy:
                      row.credit.approvedBy?.name ??
                      row.credit.approvedBy?.email ??
                      null,
                  manualRemainingBefore:
                      row.credit.manualRemainingBefore?.toFixed(2) ?? null,
                  taxAmount: row.credit.taxAmount.toFixed(2),
                  reviewReason: row.credit.reviewReason,
                  totalAmount: row.credit.totalAmount.toFixed(2),
                  postedAt: row.credit.postedAt?.toISOString() ?? null,
                  reversedAt: row.credit.reversedAt?.toISOString() ?? null,
                  reversalReason: row.credit.reversalReason,
                  allocations: row.credit.allocations.map((line) => ({
                      invoiceNumber: line.invoice.invoiceNumber,
                      quantity: line.quantity?.toString() ?? null,
                      totalAmount: line.totalAmount.toFixed(2),
                  })),
              }
            : null,
        invoices: invoices.map((invoice) => ({
            id: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            status: invoice.status,
            totalAmount: invoice.totalAmount.toFixed(2),
            paidAmount: invoice.paidAmount.toFixed(2),
            creditedAmount: invoice.creditedAmount.toFixed(2),
            priceAdjustmentAmount: invoice.priceAdjustmentAmount.toFixed(2),
            remaining: invoice.totalAmount
                .plus(invoice.priceAdjustmentAmount)
                .minus(invoice.paidAmount)
                .minus(invoice.creditedAmount)
                .toFixed(2),
            basis: invoice.returnBasisLines.map((line) => ({
                id: line.id,
                productVariantId: line.productVariantId,
                sourceItemId: line.sourceItemId,
                quantity: line.quantity.toString(),
                availableQuantity: line.quantity
                    .minus(
                        line.allocations.reduce(
                            (sum, allocation) =>
                                sum.plus(allocation.quantity ?? 0),
                            new Prisma.Decimal(0),
                        ),
                    )
                    .toString(),
                netAmount: line.netAmount.toFixed(2),
                taxAmount: line.taxAmount.toFixed(2),
                discountAmount: line.discountAmount.toFixed(2),
            })),
        })),
        items: row.items.map((item) => ({
            ...item,
            returnedQty: Number(item.returnedQty),
            unitPrice: Number(item.unitPrice),
            receipt: item.receipt
                ? {
                      sourceMovementId: item.receipt.sourceMovementId,
                      quantity: item.receipt.quantity.toString(),
                      restockValue: item.receipt.restockValue.toFixed(2),
                  }
                : null,
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
