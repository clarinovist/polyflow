'use client';

import { TransactionDateFilter } from '@/components/ui/transaction-date-filter';
import { useRouter, useSearchParams } from 'next/navigation';
import { DateRange } from 'react-day-picker';
import { useCallback } from 'react';
import { endOfDay } from 'date-fns';

interface UrlTransactionDateFilterProps {
    paramNames?: {
        from: string;
        to: string;
    };
    defaultPreset?: 'today' | 'this_week' | 'this_month' | 'all';
    align?: "start" | "center" | "end";
}

export function UrlTransactionDateFilter({
    paramNames = { from: 'startDate', to: 'endDate' },
    defaultPreset,
    align
}: UrlTransactionDateFilterProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    const from = searchParams.get(paramNames.from);
    const to = searchParams.get(paramNames.to);

    const date: DateRange | undefined = from && to ? {
        from: new Date(from),
        to: new Date(to)
    } : undefined;

    const handleDateChange = useCallback((range: DateRange | undefined) => {
        const params = new URLSearchParams(searchParams.toString());

        if (range?.from) {
            params.set(paramNames.from, range.from.toISOString());
        } else {
            params.delete(paramNames.from);
        }

        if (range?.to) {
            const end = endOfDay(range.to);
            params.set(paramNames.to, end.toISOString());
        } else {
            params.delete(paramNames.to);
        }

        router.push(`?${params.toString()}`);
    }, [searchParams, router, paramNames]);

    return (
        <TransactionDateFilter
            date={date}
            onDateChange={handleDateChange}
            defaultPreset={!date ? defaultPreset : undefined}
            align={align}
        />
    );
}
