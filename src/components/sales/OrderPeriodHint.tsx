'use client';
import { CalendarDays } from 'lucide-react';
import { toBusinessDateString } from '@/lib/utils/timezone';

const MONTH_NAMES = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember',
] as const;
const MONTH_SHORT = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'Mei',
    'Jun',
    'Jul',
    'Agt',
    'Sep',
    'Okt',
    'Nov',
    'Des',
] as const;

function dateParts(date: Date): { year: number; month: number; day: number } {
    const [year, month, day] = toBusinessDateString(date).split('-').map(Number);
    return { year, month, day };
}

function perLabel(start: Date, end: Date): string {
    const startParts = dateParts(start);
    const endParts = dateParts(end);
    const sameMonth =
        startParts.year === endParts.year &&
        startParts.month === endParts.month;

    if (sameMonth) {
        return `${MONTH_NAMES[startParts.month - 1]} ${startParts.year} (${startParts.day}–${endParts.day} ${MONTH_SHORT[endParts.month - 1]} ${endParts.year})`;
    }

    return `${startParts.day} ${MONTH_SHORT[startParts.month - 1]} – ${endParts.day} ${MONTH_SHORT[endParts.month - 1]} ${endParts.year}`;
}

export function OrderPeriodHint({
    start,
    end,
    displayedCount,
}: {
    start: Date;
    end: Date;
    displayedCount: number;
}) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground">
                <CalendarDays className="h-4 w-4" />
                <span className="font-medium text-foreground">Periode: </span>
                {perLabel(start, end)}
                <span className="hidden sm:inline text-xs">• orderDate</span>
            </span>
            <span className="text-xs text-muted-foreground">
                Menampilkan:{' '}
                <span className="font-semibold text-foreground">
                    {displayedCount}
                </span>
            </span>
        </div>
    );
}
