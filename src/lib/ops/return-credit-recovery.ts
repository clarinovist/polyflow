import { Prisma, type PrismaClient } from '@prisma/client';

export interface RecoveryRequest {
    creditId: string;
    kind: 'REINSTATE' | 'COMPENSATE';
    postingDate: string;
    actorId: string;
    reason: string;
    evidence: string;
    expectedFingerprint?: string;
}

function parseRequest(input: RecoveryRequest) {
    if (!input.creditId || !input.actorId || !['REINSTATE', 'COMPENSATE'].includes(input.kind)) throw new Error('Credit, actor and recovery kind required.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.postingDate)) throw new Error('Business posting date YYYY-MM-DD required.');
    const date = new Date(`${input.postingDate}T00:00:00+07:00`);
    if (!Number.isFinite(date.getTime()) || new Date(date.getTime() + 7 * 3600000).toISOString().slice(0, 10) !== input.postingDate) throw new Error('Invalid calendar date.');
    const reason = input.reason.trim();
    const evidence = input.evidence.trim();
    if ([reason, evidence].some(value => value.length < 5 || value.length > 1000)) throw new Error('Reason and evidence must have 5–1000 characters.');
    return { ...input, reason, evidence, date };
}

/** SQL migration owns the single audited mutation primitive; no cache-only writer. */
export async function recoverReturnCredit(db: PrismaClient, input: RecoveryRequest, execute = false) {
    const data = parseRequest(input);
    return db.$transaction(async tx => {
        if (!execute) await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        const credit = await tx.salesReturnCredit.findUniqueOrThrow({
            where: { id: data.creditId },
            include: {
                salesReturn: { select: { returnNumber: true, salesOrder: { select: { orderNumber: true } } } },
                allocations: { include: { invoice: true }, orderBy: { id: 'asc' } },
                recoveries: { orderBy: { createdAt: 'asc' } },
            },
        });
        const [identity] = await tx.$queryRaw<{ database: string; fingerprint: string }[]>`
            SELECT current_database() AS database, return_recovery_fingerprint(${credit.id}) AS fingerprint`;
        if (execute && !data.expectedFingerprint) throw new Error('An explicit reviewed fingerprint is required to execute.');
        let eventId: string | null = null;
        if (execute) {
            const [result] = await tx.$queryRaw<{ id: string }[]>`
                SELECT post_return_credit_recovery(${credit.id},${data.kind}::"ReturnCreditRecoveryKind",${data.date}::timestamp,${data.actorId},${data.reason},${data.evidence},${data.expectedFingerprint}) AS id`;
            eventId = result.id;
        } else {
            // This validation never mutates; capacity checked again atomically at execute.
            await tx.$queryRaw`SELECT validate_return_recovery(${credit.id},${data.kind}::"ReturnCreditRecoveryKind",${data.date}::timestamp,${data.actorId})::text`;
        }
        const ids = [...new Set(credit.allocations.map(a => a.invoiceId))];
        const invoices = await tx.invoice.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' } });
        return {
            mode: execute ? 'EXECUTE' : 'DRY_RUN', database: identity.database,
            fingerprint: identity.fingerprint, eventId, creditId: credit.id,
            returnNumber: credit.salesReturn.returnNumber,
            orderNumber: credit.salesReturn.salesOrder.orderNumber,
            kind: data.kind, totalAmount: credit.totalAmount.toFixed(2),
            netAmount: credit.netAmount.toFixed(2), taxAmount: credit.taxAmount.toFixed(2),
            existingEvents: credit.recoveries.map(e => ({ id: e.id, kind: e.kind, postingDate: e.postingDate.toISOString() })),
            invoices: invoices.map(invoice => {
                const amount = credit.allocations.filter(a => a.invoiceId === invoice.id).reduce((s, a) => s.plus(a.totalAmount), new Prisma.Decimal(0));
                return { id: invoice.id, number: invoice.invoiceNumber, status: invoice.status,
                    total: invoice.totalAmount.toFixed(2), paid: invoice.paidAmount.toFixed(2),
                    credited: invoice.creditedAmount.toFixed(2), remaining: invoice.remainingAmount.toFixed(2),
                    projectedRemaining: execute || credit.recoveries.some(e => e.kind === data.kind)
                        ? invoice.remainingAmount.toFixed(2)
                        : invoice.remainingAmount.plus(data.kind === 'REINSTATE' ? amount.negated() : amount).toFixed(2) };
            }),
        };
    }, { timeout: 20000 });
}
