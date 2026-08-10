import { describe, expect, it } from 'vitest';
import { resolveSalesInvoiceListPeriod } from '@/lib/sales/invoice-period';

describe('resolveSalesInvoiceListPeriod', () => {
    const now = new Date('2026-08-10T09:00:00Z');

    it('uses all-time mode for overdue dashboard deep-link without explicit dates', () => {
        const result = resolveSalesInvoiceListPeriod(
            { status: 'OVERDUE' },
            now,
        );

        expect(result.dateRange).toBeUndefined();
        expect(result.periodLabel).toBe('Semua periode');
        expect(result.dateFilterDefaultPreset).toBe('all');
    });

    it('keeps explicit date range even for overdue status', () => {
        const result = resolveSalesInvoiceListPeriod(
            {
                status: 'OVERDUE',
                startDate: '2026-07-31T17:00:00.000Z',
                endDate: '2026-08-31T16:59:59.999Z',
            },
            now,
        );

        expect(result.dateRange?.startDate.toISOString()).toBe(
            '2026-07-31T17:00:00.000Z',
        );
        expect(result.dateRange?.endDate.toISOString()).toBe(
            '2026-08-31T16:59:59.999Z',
        );
        expect(result.periodLabel).toMatch(/^(31 Jul|1 Agt) – 31 Agt 2026$/);
        expect(result.dateFilterDefaultPreset).toBeUndefined();
    });

    it('defaults normal invoice page to current month', () => {
        const result = resolveSalesInvoiceListPeriod({}, now);

        expect(result.dateRange?.startDate).toBeInstanceOf(Date);
        expect(result.dateRange?.endDate).toBeInstanceOf(Date);
        expect(result.periodLabel).toBe('1 Agt – 31 Agt 2026');
        expect(result.dateFilterDefaultPreset).toBe('this_month');
    });
});
