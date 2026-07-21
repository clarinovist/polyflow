"use client";
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { CalendarDays } from 'lucide-react';

function perLabel(s: Date, e: Date): string {
  const same = s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth();
  if (same) {
    const m = format(s, 'LLLL yyyy', { locale: idLocale });
    return `${m[0].toUpperCase() + m.slice(1)} (${format(s, 'd', { locale: idLocale })}–${format(e, 'd MMM yyyy', { locale: idLocale })})`;
  }
  return `${format(s, 'd MMM', { locale: idLocale })} – ${format(e, 'd MMM yyyy', { locale: idLocale })}`;
}

export function OrderPeriodHint({ start, end, displayedCount }: { start: Date; end: Date; displayedCount: number }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <CalendarDays className="h-4 w-4" />
        <span className="font-medium text-foreground">Periode: </span>{perLabel(start, end)}
        <span className="hidden sm:inline text-xs">• orderDate</span>
      </span>
      <span className="text-xs text-muted-foreground">Menampilkan: <span className="font-semibold text-foreground">{displayedCount}</span></span>
    </div>
  );
}
