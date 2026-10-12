// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { toCalendarDateParam } from '../finance-date-filter';

describe('FinanceDateFilter calendar serialization', () => {
    it('keeps the selected October end date as 31 October', () => {
        const end = new Date(2026, 9, 31, 23, 59, 59, 999);

        expect(toCalendarDateParam(end)).toBe('2026-10-31');
    });

    it('serializes calendar dates without timezone-bearing instants', () => {
        const start = new Date(2026, 9, 1);

        expect(toCalendarDateParam(start)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(toCalendarDateParam(start)).not.toContain('T');
    });
});
