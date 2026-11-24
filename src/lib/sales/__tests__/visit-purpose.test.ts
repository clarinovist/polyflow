import { describe, it, expect } from 'vitest';
import { ValidationError } from '@/lib/errors/errors';
import {
    VISIT_PURPOSE_MAX_LENGTH,
    normalizeVisitPurpose,
    purposeBackfill,
} from '../visit-purpose';

describe('normalizeVisitPurpose', () => {
    it('returns null when purpose is undefined or null (legacy data)', () => {
        expect(normalizeVisitPurpose(undefined)).toBeNull();
        expect(normalizeVisitPurpose(null)).toBeNull();
    });

    it('returns null for empty or whitespace-only string', () => {
        expect(normalizeVisitPurpose('')).toBeNull();
        expect(normalizeVisitPurpose('   \n ')).toBeNull();
    });

    it('trims surrounding whitespace', () => {
        expect(normalizeVisitPurpose('  Tagih piutang  ')).toBe('Tagih piutang');
    });

    it('accepts exactly the max length', () => {
        const value = 'a'.repeat(VISIT_PURPOSE_MAX_LENGTH);
        expect(normalizeVisitPurpose(value)).toBe(value);
    });

    it('measures length after trimming', () => {
        const value = `  ${'a'.repeat(VISIT_PURPOSE_MAX_LENGTH)}  `;
        expect(normalizeVisitPurpose(value)).toHaveLength(
            VISIT_PURPOSE_MAX_LENGTH,
        );
    });

    it('throws ValidationError when longer than the max length', () => {
        const value = 'a'.repeat(VISIT_PURPOSE_MAX_LENGTH + 1);
        expect(() => normalizeVisitPurpose(value)).toThrow(ValidationError);
    });

    it('throws ValidationError for a non-string value from an untyped caller', () => {
        expect(() => normalizeVisitPurpose(42 as unknown as string)).toThrow(
            ValidationError,
        );
    });
});

describe('purposeBackfill', () => {
    it('returns the purpose when the stored value is empty', () => {
        expect(purposeBackfill(null, 'Survey')).toEqual({ purpose: 'Survey' });
        expect(purposeBackfill(undefined, 'Survey')).toEqual({
            purpose: 'Survey',
        });
        expect(purposeBackfill('', 'Survey')).toEqual({ purpose: 'Survey' });
    });

    it('never overwrites an existing purpose', () => {
        expect(purposeBackfill('Lama', 'Baru')).toEqual({});
    });

    it('returns nothing when no purpose is supplied', () => {
        expect(purposeBackfill(null, null)).toEqual({});
    });
});
