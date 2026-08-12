import { endOfMonth, format, parseISO, startOfMonth } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

export type SalesInvoiceSearchParams = {
    startDate?: string;
    endDate?: string;
    status?: string;
};

type SalesInvoiceDateRange = {
    startDate: Date;
    endDate: Date;
};

type SalesInvoiceDateFilterPreset = 'this_month' | 'all';

export type SalesInvoiceListPeriod = {
    dateRange?: SalesInvoiceDateRange;
    periodLabel: string;
    dateFilterDefaultPreset?: SalesInvoiceDateFilterPreset;
};

function formatPeriodLabel(range: SalesInvoiceDateRange): string {
    return `${format(range.startDate, 'd MMM', {
        locale: idLocale,
    })} – ${format(range.endDate, 'd MMM yyyy', { locale: idLocale })}`;
}

export function resolveSalesInvoiceListPeriod(
    params: SalesInvoiceSearchParams,
    referenceDate = new Date(),
): SalesInvoiceListPeriod {
    if (params.startDate && params.endDate) {
        const dateRange = {
            startDate: parseISO(params.startDate),
            endDate: parseISO(params.endDate),
        };

        return {
            dateRange,
            periodLabel: formatPeriodLabel(dateRange),
            dateFilterDefaultPreset: undefined,
        };
    }

    if (params.status?.toUpperCase() === 'OVERDUE') {
        return {
            dateRange: undefined,
            periodLabel: 'Semua periode',
            dateFilterDefaultPreset: 'all',
        };
    }

    const dateRange = {
        startDate: startOfMonth(referenceDate),
        endDate: endOfMonth(referenceDate),
    };

    return {
        dateRange,
        periodLabel: formatPeriodLabel(dateRange),
        dateFilterDefaultPreset: 'this_month',
    };
}
