'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { MonthPicker } from '@/components/ui/month-picker';

export function FinanceDateFilter() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();

    // Initialize state from URL or current date
    const startDateParam = searchParams.get('startDate');
    const [currentDate, setCurrentDate] = useState<Date>(
        startDateParam ? new Date(startDateParam) : new Date()
    );

    function handleMonthChange(range: { from: Date; to: Date }) {
        setCurrentDate(range.from);

        const params = new URLSearchParams(searchParams);
        params.set('startDate', range.from.toISOString());
        params.set('endDate', range.to.toISOString());

        startTransition(() => {
            router.replace(`${pathname}?${params.toString()}`);
        });
    }

    return (
        <div className="flex items-center gap-2">
            <MonthPicker
                currentDate={currentDate}
                onDateChange={handleMonthChange}
            />
            {isPending && <span className="text-xs text-muted-foreground animate-pulse">Updating...</span>}
        </div>
    );
}
