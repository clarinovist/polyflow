import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { productionOutputSchema, logRunningOutputSchema } from '../production';
import { productionOutputDateSchema } from '../production-output-date';

const now = new Date('2026-09-01T17:05:00Z'); // 2 September, 00:05 WIB
const input = {
    productionOrderId: 'wo-date-test',
    shiftId: 'shift-date-test',
    quantityProduced: 10,
    startTime: now,
    endTime: now,
};

describe('WO production date validation', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(now);
    });
    afterEach(() => vi.useRealTimers());

    it.each(['2026-09-02', '2026-09-01', '2024-02-29'])(
        'accepts and retains valid WIB date %s', (productionDate) => {
            expect(productionOutputSchema.parse({ ...input, productionDate }).productionDate)
                .toBe(productionDate);
        },
    );

    it.each(['', '2026-02-29', '2026-02-30', '2026-13-01', '02/09/2026', '2026-9-2', '2026-09-02T00:00:00Z', '2026-09-03', null])(
        'rejects invalid/future date %s at action schema', (productionDate) => {
            const result = productionOutputSchema.safeParse({ ...input, productionDate });
            expect(result.success).toBe(false);
            if (!result.success) expect(result.error.issues[0].path).toEqual(['productionDate']);
        },
    );

    it('allows legacy payloads without a date and leaves kiosk contract unchanged', () => {
        expect(productionOutputSchema.parse(input).productionDate).toBeUndefined();
        expect(logRunningOutputSchema.parse({
            executionId: 'execution-test', quantityProduced: 5, productionDate: '2026-09-01',
        })).not.toHaveProperty('productionDate');
    });

    it('uses WIB midnight, not the UTC date, as the future-date boundary', () => {
        vi.setSystemTime(new Date('2026-09-01T16:59:59Z'));
        expect(productionOutputDateSchema.safeParse('2026-09-02').success).toBe(false);
        vi.setSystemTime(new Date('2026-09-01T17:00:00Z'));
        expect(productionOutputDateSchema.safeParse('2026-09-02').success).toBe(true);
    });
});
