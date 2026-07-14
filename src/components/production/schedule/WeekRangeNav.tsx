'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { format, addDays, parseISO, isValid, startOfDay } from 'date-fns';
import { planningLabels } from '@/lib/labels/planning';
import { id as localeID } from 'date-fns/locale';

interface WeekRangeNavProps {
    from: string | null;
}

export function WeekRangeNav({ from }: WeekRangeNavProps) {
    const baseDate = useMemo(() => {
        if (!from) return startOfDay(new Date());
        const parsed = parseISO(from);
        return isValid(parsed) ? startOfDay(parsed) : startOfDay(new Date());
    }, [from]);

    const endDate = useMemo(() => addDays(baseDate, 6), [baseDate]);

    const prevFrom = format(addDays(baseDate, -7), 'yyyy-MM-dd');
    const nextFrom = format(addDays(baseDate, 7), 'yyyy-MM-dd');
    const todayStr = format(startOfDay(new Date()), 'yyyy-MM-dd');

    const isOnToday = format(baseDate, 'yyyy-MM-dd') === todayStr;

    return (
        <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                <Link href={`/production/schedule?from=${prevFrom}`} aria-label="Minggu sebelumnya">
                    <ChevronLeft className="h-4 w-4" />
                </Link>
            </Button>
            <span className="text-sm font-medium px-2 select-none">
                {format(baseDate, 'MMM dd', { locale: localeID })} - {format(endDate, 'MMM dd, yyyy', { locale: localeID })}
            </span>
            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                <Link href={`/production/schedule?from=${nextFrom}`} aria-label="Minggu berikutnya">
                    <ChevronRight className="h-4 w-4" />
                </Link>
            </Button>
            {!isOnToday && (
                <Button variant="ghost" size="sm" className="h-8 text-xs ml-1" asChild>
                    <Link href={`/production/schedule?from=${todayStr}`}>
                        <RotateCcw className="mr-1 h-3 w-3" />
                        {planningLabels.today}
                    </Link>
                </Button>
            )}
        </div>
    );
}
