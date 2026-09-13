'use client';

import * as React from 'react';
import {
    ChevronLeft,
    ChevronRight,
    Calendar as CalendarIcon,
} from 'lucide-react';
import {
    format,
    addMonths,
    subMonths,
    startOfMonth,
    endOfMonth,
    isSameMonth,
} from 'date-fns';
import { id } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/utils';

interface MonthPickerProps {
    currentDate: Date;
    onDateChange: (date: { from: Date; to: Date }) => void;
    className?: string;
}

export function MonthPicker({
    currentDate,
    onDateChange,
    className,
}: MonthPickerProps) {
    const handlePrevMonth = () => {
        const prevMonth = subMonths(currentDate, 1);
        onDateChange({
            from: startOfMonth(prevMonth),
            to: endOfMonth(prevMonth),
        });
    };

    const handleNextMonth = () => {
        const nextMonth = addMonths(currentDate, 1);
        onDateChange({
            from: startOfMonth(nextMonth),
            to: endOfMonth(nextMonth),
        });
    };

    const handleThisMonth = () => {
        const now = new Date();
        onDateChange({
            from: startOfMonth(now),
            to: endOfMonth(now),
        });
    };

    const isCurrentMonth = isSameMonth(currentDate, new Date());

    return (
        <div
            className={cn(
                'flex min-w-0 max-w-full flex-wrap items-center gap-2',
                className,
            )}
        >
            <div className="flex min-w-0 max-w-full items-center overflow-hidden rounded-md border bg-background">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 shrink-0 rounded-none border-r sm:h-9 sm:w-9"
                    onClick={handlePrevMonth}
                    aria-label="Bulan sebelumnya"
                >
                    <ChevronLeft className="h-4 w-4" />
                </Button>

                <div className="flex min-w-0 flex-1 items-center justify-center gap-2 px-2 py-1.5 text-sm font-medium sm:min-w-[160px] sm:px-4">
                    <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate capitalize">
                        {format(currentDate, 'MMMM yyyy', { locale: id })}
                    </span>
                </div>

                <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 shrink-0 rounded-none border-l sm:h-9 sm:w-9"
                    onClick={handleNextMonth}
                    aria-label="Bulan berikutnya"
                >
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>

            <Button
                variant="outline"
                size="sm"
                className={cn(
                    'min-h-11 px-3 text-xs sm:min-h-9',
                    isCurrentMonth &&
                        'bg-muted text-muted-foreground cursor-default hover:bg-muted',
                )}
                onClick={handleThisMonth}
                disabled={isCurrentMonth}
            >
                Bulan Ini
            </Button>
        </div>
    );
}
