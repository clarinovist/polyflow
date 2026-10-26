import { describe, expect, it } from 'vitest';
import { readDailyReportOutcome } from '../daily-report-outcome';

describe('readDailyReportOutcome', () => {
    const sent = ['id-a', 'id-b', 'id-c'];

    it('marks saved entries for removal and keeps the server message per failed entry', () => {
        // Act
        const outcome = readDailyReportOutcome(sent, {
            results: [{ index: 0 }, { index: 2 }],
            errors: [{ index: 1, error: 'Shift tidak valid untuk SPK ini.' }],
        });

        // Assert
        expect(outcome.savedIndexes).toEqual([0, 2]);
        expect(outcome.errorsById).toEqual({ 'id-b': 'Shift tidak valid untuk SPK ini.' });
    });

    it('falls back to a generic message when the server gives none', () => {
        // Act
        const outcome = readDailyReportOutcome(sent, { errors: [{ index: 0, error: '' }] });

        // Assert
        expect(outcome.savedIndexes).toEqual([]);
        expect(outcome.errorsById).toEqual({ 'id-a': 'Gagal disimpan. Periksa isian entri ini.' });
    });

    it('ignores indexes outside the sent entries', () => {
        // Act
        const outcome = readDailyReportOutcome(sent, {
            results: [{ index: 7 }],
            errors: [{ index: -1, error: 'x' }],
        });

        // Assert
        expect(outcome.savedIndexes).toEqual([]);
        expect(outcome.errorsById).toEqual({});
    });
});
