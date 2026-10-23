import type { Prisma } from '@prisma/client';

/** Original history stays REVERSED; only this predicate describes current credit. */
export const effectiveReturnCreditWhere: Prisma.SalesReturnCreditWhereInput = {
    OR: [
        { status: 'POSTED' },
        {
            status: 'REVERSED',
            AND: [
                { recoveries: { some: { kind: 'REINSTATE' } } },
                { recoveries: { none: { kind: 'COMPENSATE' } } },
            ],
        },
    ],
};

export function hasActiveRecovery(events: ReadonlyArray<{ kind: string }> = []) {
    return events.some((event) => event.kind === 'REINSTATE') &&
        !events.some((event) => event.kind === 'COMPENSATE');
}
