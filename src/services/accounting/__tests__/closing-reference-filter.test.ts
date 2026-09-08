import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { nonClosingJournalFilter, nonClosingReferenceSql } from '../closing-reference-filter';

describe('closing reference exclusion contract', () => {
    it('creates independent filters excluding only the two reserved prefixes', () => {
        const first = nonClosingJournalFilter();
        const second = nonClosingJournalFilter();
        expect(first).toEqual({ NOT: [
            { reference: { startsWith: 'CLOSING-' } },
            { reference: { startsWith: 'CLOSE-' } },
        ] });
        expect(first).not.toBe(second);
        expect(first.NOT).not.toBe(second.NOT);
        expect(first).not.toHaveProperty('referenceType');
    });
    it('parameterizes equivalent SQL with AND, preserving SQL NULL semantics', () => {
        const sql = nonClosingReferenceSql(Prisma.sql`j.reference`);
        expect(sql.text).toBe('(j.reference NOT LIKE $1 AND j.reference NOT LIKE $2)');
        expect(sql.values).toEqual(['CLOSING-%', 'CLOSE-%']);
    });
});
