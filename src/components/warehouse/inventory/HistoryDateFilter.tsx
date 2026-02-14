'use client';

import { TransactionDateFilter } from '@/components/ui/transaction-date-filter';
import { useRouter, useSearchParams } from 'next/navigation';
import { DateRange } from 'react-day-picker';
import { useCallback } from 'react';
import { endOfDay } from 'date-fns';

export function HistoryDateFilter() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const from = searchParams.get('from');
    const to = searchParams.get('to');

    const date: DateRange | undefined = from && to ? {
        from: new Date(from),
        to: new Date(to)
    } : undefined;

    const handleDateChange = useCallback((range: DateRange | undefined) => {
        const params = new URLSearchParams(searchParams.toString());
        if (range?.from) {
            params.set('from', range.from.toISOString());
        } else {
            params.delete('from');
        }

        if (range?.to) {
            // Ensure end date covers the full day
            const end = endOfDay(range.to);
            params.set('to', end.toISOString());
        } else {
            params.delete('to');
        }

        // Reset pagination if exists? Not needed yet as page doesn't have pagination params shown
        router.push(`?${params.toString()}`);
    }, [searchParams, router]);

    return (
        <TransactionDateFilter
            date={date}
            onDateChange={handleDateChange}
            defaultPreset={!date ? 'today' : undefined}
            align="end"
        />
    );
}
