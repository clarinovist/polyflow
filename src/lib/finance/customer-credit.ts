import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { toBusinessDateString } from '@/lib/utils/timezone';

const id = z.string().trim().min(1).max(100);
const money = z.string().regex(/^(0|[1-9]\d{0,12})(\.\d{1,2})?$/);
const reason = z.string().trim().min(10).max(1000);
const command = z.object({
    postingDate: z.coerce.date(),
    reason,
    confirmed: z.literal(true),
});
export const issueCustomerCreditInput = command.extend({
    returnId: id,
    invoiceId: id,
    totalAmount: money,
    taxAmount: money,
    evidence: reason,
});
export const applyCustomerCreditInput = command.extend({
    noteId: id,
    invoiceId: id,
    totalAmount: money,
    expectedBalance: money,
    expectedInvoiceBalance: money,
    idempotencyKey: z.string().uuid(),
});
export const reverseCustomerCreditInput = z.object({
    id,
    reversalDate: z.coerce.date(),
    reason,
    confirmed: z.literal(true),
});
export const customerCreditLinkInput = z.object({
    fromCustomerId: id,
    toCustomerId: id,
    reason,
    evidence: reason,
    confirmed: z.literal(true),
});
export const revokeCustomerCreditLinkInput = z.object({
    id,
    reason,
    confirmed: z.literal(true),
});

export function creditSignature(data: Record<string, unknown>) {
    return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}
export function creditDate(date: Date, earliest: Date) {
    const day = toBusinessDateString(date);
    if (
        day < toBusinessDateString(earliest) ||
        day > toBusinessDateString(new Date())
    )
        throw new Error(
            'Tanggal kredit harus sesudah sumber/riwayat dan tidak di masa depan.',
        );
}
export function creditBalance(
    total: Prisma.Decimal,
    applications: { totalAmount: Prisma.Decimal; status: string }[],
) {
    return total.minus(
        applications
            .filter((a) => a.status === 'POSTED')
            .reduce((sum, a) => sum.plus(a.totalAmount), new Prisma.Decimal(0)),
    );
}
