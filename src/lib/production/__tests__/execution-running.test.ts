import { describe, expect, it } from 'vitest';
import { executionCostHours } from '@/lib/production/execution-running';

const start = new Date('2026-10-28T01:00:00.000Z');
const now = new Date('2026-10-28T05:00:00.000Z');

describe('executionCostHours', () => {
    it('uses the recorded end of a closed session', () => {
        // Arrange
        const execution = {
            startTime: start,
            endTime: new Date('2026-10-28T03:30:00.000Z'),
        };

        // Act
        const hours = executionCostHours(execution, 'COMPLETED', now);

        // Assert
        expect(hours).toBe(2.5);
    });

    it('accrues an open session on an open SPK up to now', () => {
        // Act
        const hours = executionCostHours(
            { startTime: start, endTime: null },
            'IN_PROGRESS',
            now,
        );

        // Assert
        expect(hours).toBe(4);
    });

    it.each(['COMPLETED', 'CANCELLED'])(
        'charges nothing for an open shell on a %s SPK',
        (orderStatus) => {
            // Act
            const hours = executionCostHours(
                { startTime: start, endTime: null },
                orderStatus,
                now,
            );

            // Assert
            expect(hours).toBe(0);
        },
    );

    it('never returns negative hours when the end precedes the start', () => {
        // Act
        const hours = executionCostHours(
            { startTime: now, endTime: start },
            'COMPLETED',
            now,
        );

        // Assert
        expect(hours).toBe(0);
    });
});
