import { describe, expect, it } from 'vitest';

import {
    parseTablePage,
    parseTablePageSize,
    parseTableSortDirection,
    parseTableSortKey,
} from '../table-query';

describe('table query parsing', () => {
    it('accepts positive integer pages and rejects malformed input', () => {
        expect(parseTablePage('3')).toBe(3);
        expect(parseTablePage(4)).toBe(4);
        expect(parseTablePage('0')).toBe(1);
        expect(parseTablePage('-2')).toBe(1);
        expect(parseTablePage('2.5')).toBe(1);
        expect(parseTablePage(['2'])).toBe(1);
    });

    it('defaults and caps page size at a safe maximum', () => {
        expect(parseTablePageSize(undefined)).toBe(50);
        expect(parseTablePageSize('25')).toBe(25);
        expect(parseTablePageSize('500')).toBe(100);
        expect(parseTablePageSize('invalid')).toBe(50);
        expect(
            parseTablePageSize('80', { defaultPageSize: 20, maxPageSize: 60 }),
        ).toBe(60);
        expect(
            parseTablePageSize(undefined, { defaultPageSize: 12.5 }),
        ).toBe(50);
        expect(
            parseTablePageSize(undefined, { defaultPageSize: Infinity }),
        ).toBe(50);
        expect(parseTablePageSize('500', { maxPageSize: 12.5 })).toBe(100);
        expect(parseTablePageSize('500', { maxPageSize: NaN })).toBe(100);
    });

    it('allows only explicit sort keys and directions', () => {
        const allowedSortKeys = ['name', 'createdAt'] as const;

        expect(parseTableSortKey('name', allowedSortKeys, 'createdAt')).toBe(
            'name',
        );
        expect(
            parseTableSortKey('unsupported', allowedSortKeys, 'createdAt'),
        ).toBe('createdAt');
        // @ts-expect-error fallback must be a member of allowedSortKeys
        parseTableSortKey('name', allowedSortKeys, 'unsupported');
        expect(parseTableSortDirection('desc')).toBe('desc');
        expect(parseTableSortDirection('invalid')).toBe('asc');
        expect(parseTableSortDirection(undefined, 'desc')).toBe('desc');
    });
});
