'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { WeekPicker } from '@/components/ui/week-picker';
import { startOfWeek, endOfWeek } from '@/services/hrd/week-range';

interface Props {
    currentDate: Date;
    paramName?: string;
    basePath?: string;
}

/** WeekPicker that syncs the selected week to a URL search-param (?date=YYYY-MM-DD). */
export function UrlWeekPicker({ currentDate, paramName = 'date', basePath }: Props) {
    const router = useRouter();
    const sp = useSearchParams();

    const onDateChange = (d: { from: Date; to: Date }) => {
        const params = new URLSearchParams(sp.toString());
        // Any date inside the target week resolves correctly server-side via startOfWeek.
        params.set(paramName, d.from.toISOString().slice(0, 10));
        router.push(`${basePath ?? ''}?${params.toString()}`);
    };

    return <WeekPicker currentDate={currentDate} onDateChange={onDateChange} />;
}

// Re-export for callers that need week bounds directly.
export { startOfWeek, endOfWeek };
