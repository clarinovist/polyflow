'use client';

import { TransactionDateFilter } from '@/components/common/transaction-date-filter';
import { useRouter, useSearchParams } from 'next/navigation';
import { DateRange } from 'react-day-picker';
import { useCallback } from 'react';
import { endOfDay } from 'date-fns';
import {
    getWibDayBounds,
    toBusinessDateString,
} from '@/lib/utils/timezone';
import { formatLocalDate, parseLocalDate } from '@/lib/dates/parse-local-date';

interface UrlTransactionDateFilterProps {
    paramNames?: {
        from: string;
        to: string;
    };
    defaultPreset?: 'today' | 'this_week' | 'this_month' | 'all';
    presetTimeZone?: 'Asia/Jakarta';
    align?: 'start' | 'center' | 'end';
}

function parseUrlDate(value: string, useWibCalendar: boolean): Date {
    const instant = new Date(value);
    if (!useWibCalendar || Number.isNaN(instant.getTime())) return instant;
    return parseLocalDate(toBusinessDateString(instant));
}

function serializeRangeBoundary(
    date: Date,
    boundary: 'start' | 'end',
    useWibCalendar: boolean,
): Date {
    if (!useWibCalendar) return boundary === 'start' ? date : endOfDay(date);

    const bounds = getWibDayBounds(formatLocalDate(date));
    return boundary === 'start' ? bounds.startOfDay : bounds.endOfDay;
}

export function UrlTransactionDateFilter({
    paramNames = { from: 'startDate', to: 'endDate' },
    defaultPreset,
    presetTimeZone,
    align,
}: UrlTransactionDateFilterProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    const from = searchParams.get(paramNames.from);
    const to = searchParams.get(paramNames.to);

    const date: DateRange | undefined =
        from && to
            ? {
                  from: parseUrlDate(from, Boolean(presetTimeZone)),
                  to: parseUrlDate(to, Boolean(presetTimeZone)),
              }
            : undefined;

    const handleDateChange = useCallback(
        (range: DateRange | undefined) => {
            const params = new URLSearchParams(searchParams.toString());

            if (range?.from) {
                const start = serializeRangeBoundary(
                    range.from,
                    'start',
                    Boolean(presetTimeZone),
                );
                params.set(paramNames.from, start.toISOString());
            } else {
                params.delete(paramNames.from);
            }

            if (range?.to) {
                const end = serializeRangeBoundary(
                    range.to,
                    'end',
                    Boolean(presetTimeZone),
                );
                params.set(paramNames.to, end.toISOString());
            } else {
                params.delete(paramNames.to);
            }

            router.push(`?${params.toString()}`);
        },
        [searchParams, router, paramNames, presetTimeZone],
    );

    return (
        <TransactionDateFilter
            date={date}
            onDateChange={handleDateChange}
            defaultPreset={!date ? defaultPreset : undefined}
            presetTimeZone={presetTimeZone}
            align={align}
        />
    );
}
