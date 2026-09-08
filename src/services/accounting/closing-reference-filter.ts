import { Prisma } from '@prisma/client';

// Reserved closing references: current writers and historical imports.
const CLOSING_REFERENCE_PREFIXES = ['CLOSING-', 'CLOSE-'] as const;

/** P&L activity only; do not apply to ledgers or balance-sheet postings.
 * A missing optional reference does not make a posted transaction a closing.
 */
export function nonClosingJournalFilter(): Prisma.JournalEntryWhereInput {
    return {
        OR: [
            { reference: null },
            { NOT: CLOSING_REFERENCE_PREFIXES.map(prefix => ({
                reference: { startsWith: prefix },
            })) },
        ],
    };
}

/** Supply a static Prisma.sql column expression, never user-provided SQL. */
export function nonClosingReferenceSql(reference: Prisma.Sql): Prisma.Sql {
    return Prisma.sql`(${reference} IS NULL OR (${Prisma.join(
        CLOSING_REFERENCE_PREFIXES.map(prefix => Prisma.sql`${reference} NOT LIKE ${`${prefix}%`}`),
        ' AND ',
    )}))`;
}
