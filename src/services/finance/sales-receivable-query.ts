import type { Prisma } from '@prisma/client';

/** Database-generated net balance: predicate is applied in the count/page query itself. */
export function positiveSalesReceivableWhere(): Prisma.InvoiceWhereInput {
    return { status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] }, remainingAmount: { gt: 0 } };
}
