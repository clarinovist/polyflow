'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { MonthPicker } from '@/components/ui/month-picker';
import { format, parseISO } from 'date-fns';

function parseFilterDate(value: string | null): Date {
    if (!value) return new Date();
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? parseISO(value)
        : new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : new Date();
}

export function toCalendarDateParam(date: Date): string {
    return format(date, 'yyyy-MM-dd');
}

export function FinanceDateFilter() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();

    // Initialize state from URL or current date
    const startDateParam = searchParams.get('startDate');
    const [currentDate, setCurrentDate] = useState<Date>(() =>
        parseFilterDate(startDateParam),
    );

    function handleMonthChange(range: { from: Date; to: Date }) {
        setCurrentDate(range.from);

        const params = new URLSearchParams(searchParams);
        // Preserve the calendar dates selected by the user. ISO instants shift
        // an end-of-month selection into the next WIB business day when the
        // browser runs in UTC (31 Oct 23:59 UTC = 1 Nov WIB).
        params.set('startDate', toCalendarDateParam(range.from));
        params.set('endDate', toCalendarDateParam(range.to));

        startTransition(() => {
            router.replace(`${pathname}?${params.toString()}`);
        });
    }

    return (
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
            <MonthPicker
                currentDate={currentDate}
                onDateChange={handleMonthChange}
            />
            {isPending && (
                <span className="text-xs text-muted-foreground animate-pulse">
                    Updating...
                </span>
            )}
        </div>
    );
}
