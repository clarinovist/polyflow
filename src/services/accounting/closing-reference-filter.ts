import { Prisma } from '@prisma/client';

// Reserved closing references: current writers and historical imports.
const CLOSING_REFERENCE_PREFIXES = ['CLOSING-', 'CLOSE-'] as const;

/** P&L activity only; do not apply to ledgers or balance-sheet postings.
 * Preserve the existing exclusion of NULL references until separately reviewed.
 */
export function nonClosingJournalFilter(): Prisma.JournalEntryWhereInput {
    return {
        NOT: CLOSING_REFERENCE_PREFIXES.map(prefix => ({
            reference: { startsWith: prefix },
        })),
    };
}

/** Supply a static Prisma.sql column expression, never user-provided SQL. */
export function nonClosingReferenceSql(reference: Prisma.Sql): Prisma.Sql {
    return Prisma.sql`(${Prisma.join(
        CLOSING_REFERENCE_PREFIXES.map(prefix => Prisma.sql`${reference} NOT LIKE ${`${prefix}%`}`),
        ' AND ',
    )})`;
}
