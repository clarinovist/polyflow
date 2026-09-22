import { z } from 'zod';
import { customerCreditDb } from './customer-credit-shared';
import { creditBalance } from '@/lib/finance/customer-credit';

const id = z.string().trim().min(1).max(100);
export async function getCustomerCredits(input: unknown) {
    const { page, search } = z
        .object({
            page: z.coerce.number().int().min(1).max(10000).default(1),
            search: z.string().trim().max(100).default(''),
        })
        .parse(input);
    const db = customerCreditDb();
    const where = {
        OR: [
            {
                customer: {
                    name: { contains: search, mode: 'insensitive' as const },
                },
            },
            {
                salesReturn: {
                    returnNumber: {
                        contains: search,
                        mode: 'insensitive' as const,
                    },
                },
            },
        ],
    };
    const [total, rows] = await Promise.all([
        db.customerCreditNote.count({ where }),
        db.customerCreditNote.findMany({
            where,
            orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
            skip: (page - 1) * 25,
            take: 25,
            include: {
                customer: { select: { name: true } },
                salesReturn: { select: { returnNumber: true } },
                applications: { select: { status: true, totalAmount: true } },
            },
        }),
    ]);
    return {
        page,
        pages: Math.max(1, Math.ceil(total / 25)),
        rows: rows.map((n) => ({
            id: n.id,
            customer: n.customer.name,
            returnNumber: n.salesReturn.returnNumber,
            status: n.status,
            total: n.totalAmount.toFixed(2),
            remaining:
                n.status === 'POSTED'
                    ? creditBalance(n.totalAmount, n.applications).toFixed(2)
                    : '0.00',
        })),
    };
}
export async function getCustomerCreditDetail(input: unknown) {
    const db = customerCreditDb();
    const note = await db.customerCreditNote.findUniqueOrThrow({
        where: { id: id.parse(input) },
        include: {
            customer: { select: { name: true } },
            salesReturn: { select: { returnNumber: true } },
            sourceInvoice: { select: { invoiceNumber: true } },
            applications: {
                orderBy: { createdAt: 'desc' },
                include: {
                    invoice: {
                        select: {
                            invoiceNumber: true,
                            salesOrder: {
                                select: {
                                    orderNumber: true,
                                    customer: { select: { name: true } },
                                },
                            },
                        },
                    },
                },
            },
        },
    });
    const links = await db.customerCreditLink.findMany({
        where: {
            revokedAt: null,
            OR: [
                { fromCustomerId: note.customerId },
                { toCustomerId: note.customerId },
            ],
        },
        include: {
            fromCustomer: { select: { name: true } },
            toCustomer: { select: { name: true } },
        },
    });
    return {
        id: note.id,
        customerId: note.customerId,
        customer: note.customer.name,
        returnId: note.salesReturnId,
        returnNumber: note.salesReturn.returnNumber,
        sourceInvoice: note.sourceInvoice.invoiceNumber,
        status: note.status,
        total: note.totalAmount.toFixed(2),
        remaining:
            note.status === 'POSTED'
                ? creditBalance(note.totalAmount, note.applications).toFixed(2)
                : '0.00',
        reason: note.reason,
        evidence: note.evidence,
        postingDate: note.postingDate.toISOString(),
        reversalReason: note.reversalReason,
        applications: note.applications.map((a) => ({
            id: a.id,
            invoiceNumber: a.invoice.invoiceNumber,
            orderNumber: a.invoice.salesOrder.orderNumber,
            customer: a.invoice.salesOrder.customer?.name ?? '—',
            total: a.totalAmount.toFixed(2),
            status: a.status,
            date: a.postingDate.toISOString(),
            reason: a.reason,
            reversalReason: a.reversalReason,
        })),
        links: links.map((l) => ({
            id: l.id,
            customer:
                l.fromCustomerId === note.customerId
                    ? l.toCustomer.name
                    : l.fromCustomer.name,
            reason: l.reason,
        })),
    };
}
export async function getCustomerCreditTargets(input: unknown) {
    const { noteId, search } = z
        .object({ noteId: id, search: z.string().trim().max(100).default('') })
        .parse(input);
    const db = customerCreditDb();
    const note = await db.customerCreditNote.findUniqueOrThrow({
        where: { id: noteId },
    });
    const links = await db.customerCreditLink.findMany({
        where: {
            revokedAt: null,
            OR: [
                { fromCustomerId: note.customerId },
                { toCustomerId: note.customerId },
            ],
        },
    });
    const customerIds = [
        ...new Set([
            note.customerId,
            ...links.flatMap((l) => [l.fromCustomerId, l.toCustomerId]),
        ]),
    ];
    const rows = await db.invoice.findMany({
        where: {
            id: { not: note.sourceInvoiceId },
            status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] },
            remainingAmount: { gt: 0 },
            salesOrder: { customerId: { in: customerIds } },
            OR: [
                { invoiceNumber: { contains: search, mode: 'insensitive' } },
                {
                    salesOrder: {
                        orderNumber: { contains: search, mode: 'insensitive' },
                    },
                },
            ],
        },
        orderBy: [{ invoiceDate: 'asc' }, { id: 'asc' }],
        take: 26,
        select: {
            id: true,
            invoiceNumber: true,
            remainingAmount: true,
            salesOrder: {
                select: {
                    orderNumber: true,
                    customer: { select: { name: true } },
                },
            },
        },
    });
    return {
        truncated: rows.length > 25,
        rows: rows.slice(0, 25).map((i) => ({
            id: i.id,
            invoiceNumber: i.invoiceNumber,
            orderNumber: i.salesOrder.orderNumber,
            customer: i.salesOrder.customer?.name ?? '—',
            remaining: i.remainingAmount.toFixed(2),
        })),
    };
}
export async function searchCreditCustomers(input: unknown) {
    const search = z.string().trim().min(2).max(100).parse(input);
    return customerCreditDb().customer.findMany({
        where: {
            isActive: true,
            OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { code: { contains: search, mode: 'insensitive' } },
            ],
        },
        select: { id: true, name: true, code: true },
        orderBy: { name: 'asc' },
        take: 25,
    });
}
export type CustomerCreditDetail = Awaited<
    ReturnType<typeof getCustomerCreditDetail>
>;
export type CustomerCreditTargets = Awaited<
    ReturnType<typeof getCustomerCreditTargets>
>;
