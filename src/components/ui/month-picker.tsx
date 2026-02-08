'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, isSameMonth } from 'date-fns';
import { id } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface MonthPickerProps {
    currentDate: Date;
    onDateChange: (date: { from: Date; to: Date }) => void;
    className?: string;
}

export function MonthPicker({ currentDate, onDateChange, className }: MonthPickerProps) {
    const handlePrevMonth = () => {
        const prevMonth = subMonths(currentDate, 1);
        onDateChange({
            from: startOfMonth(prevMonth),
            to: endOfMonth(prevMonth)
        });
    };

    const handleNextMonth = () => {
        const nextMonth = addMonths(currentDate, 1);
        onDateChange({
            from: startOfMonth(nextMonth),
            to: endOfMonth(nextMonth)
        });
    };

    const handleThisMonth = () => {
        const now = new Date();
        onDateChange({
            from: startOfMonth(now),
            to: endOfMonth(now)
        });
    };

    const isCurrentMonth = isSameMonth(currentDate, new Date());

    return (
        <div className={cn("flex items-center gap-2", className)}>
            <div className="flex items-center border rounded-md bg-background overflow-hidden">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-none border-r"
                    onClick={handlePrevMonth}
                >
                    <ChevronLeft className="h-4 w-4" />
                </Button>

                <div className="flex items-center gap-2 px-4 py-1.5 min-w-[160px] justify-center text-sm font-medium">
                    <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="capitalize">
                        {format(currentDate, 'MMMM yyyy', { locale: id })}
                    </span>
                </div>

                <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-none border-l"
                    onClick={handleNextMonth}
                >
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>

            <Button
                variant="outline"
                size="sm"
                className={cn(
                    "text-xs h-9 px-3",
                    isCurrentMonth && "bg-muted text-muted-foreground cursor-default hover:bg-muted"
                )}
                onClick={handleThisMonth}
                disabled={isCurrentMonth}
            >
                Bulan Ini
            </Button>
        </div>
    );
}
