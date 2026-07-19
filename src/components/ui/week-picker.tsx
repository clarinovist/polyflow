'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/utils';
import { startOfWeek, endOfWeek } from '@/services/hrd/week-range';

interface WeekPickerProps {
    currentDate: Date;
    onDateChange: (date: { from: Date; to: Date }) => void;
    className?: string;
}

export function WeekPicker({ currentDate, onDateChange, className }: WeekPickerProps) {
    const handlePrev = () => {
        const d = new Date(currentDate);
        d.setUTCDate(d.getUTCDate() - 7);
        onDateChange({ from: startOfWeek(d), to: endOfWeek(d) });
    };

    const handleNext = () => {
        const d = new Date(currentDate);
        d.setUTCDate(d.getUTCDate() + 7);
        onDateChange({ from: startOfWeek(d), to: endOfWeek(d) });
    };

    const handleThisWeek = () => {
        const now = new Date();
        onDateChange({ from: startOfWeek(now), to: endOfWeek(now) });
    };

    const ws = startOfWeek(currentDate);
    const we = endOfWeek(currentDate);
    const isThisWeek = ws.getTime() === startOfWeek(new Date()).getTime();

    return (
        <div className={cn('flex items-center gap-2', className)}>
            <div className="flex items-center border rounded-md bg-background overflow-hidden">
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-none border-r" onClick={handlePrev}>
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="flex items-center gap-2 px-4 py-1.5 min-w-[200px] justify-center text-sm font-medium">
                    <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                    <span>
                        {format(ws, 'dd MMM', { locale: id })} — {format(we, 'dd MMM yyyy', { locale: id })}
                    </span>
                </div>
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-none border-l" onClick={handleNext}>
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>
            <Button
                variant="outline"
                size="sm"
                className={cn(
                    'text-xs h-9 px-3',
                    isThisWeek && 'bg-muted text-muted-foreground cursor-default hover:bg-muted',
                )}
                onClick={handleThisWeek}
                disabled={isThisWeek}
            >
                Minggu Ini
            </Button>
        </div>
    );
}
