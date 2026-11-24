'use client';

import type {
    CalendarDayStatus,
    DayOutcomeEntry,
} from '@/services/hrd/attendance-day-outcomes';
import { attendanceStatusLabel } from '@/lib/hrd/attendance-status-label';

interface Props {
    year: number;
    month: number;
    days: DayOutcomeEntry[];
    selectedDate: string | null;
    isInactiveEmployee?: boolean;
    onSelectDate: (date: string) => void;
}

const WEEKDAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'] as const;

const STATUS_STYLES: Record<CalendarDayStatus, string> = {
    present:
        'bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300',
    late: 'bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-300',
    paidLeave:
        'bg-sky-500/15 text-sky-700 border-sky-500/30 dark:text-sky-300',
    deductibleLeave:
        'bg-violet-500/15 text-violet-700 border-violet-500/30 dark:text-violet-300',
    unlinkedLeave:
        'bg-sky-500/10 text-sky-700 border-sky-500/20 border-dashed dark:text-sky-300',
    absent: 'bg-rose-500/15 text-rose-700 border-rose-500/30 dark:text-rose-300',
    missing:
        'bg-orange-500/15 text-orange-700 border-orange-500/30 dark:text-orange-300',
    sunday: 'bg-muted/40 text-muted-foreground border-transparent',
    beforeJoin: 'bg-muted/20 text-muted-foreground/60 border-transparent',
    future: 'bg-muted/20 text-muted-foreground/60 border-transparent',
};

const STATUS_LABELS: Record<CalendarDayStatus, string> = {
    present: attendanceStatusLabel('PRESENT'),
    late: attendanceStatusLabel('LATE'),
    paidLeave: 'Izin dibayar',
    deductibleLeave: 'Izin dipotong',
    unlinkedLeave: 'Izin (tanpa pengajuan)',
    absent: attendanceStatusLabel('ABSENT'),
    missing: 'Tanpa catatan',
    sunday: 'Minggu',
    beforeJoin: 'Sebelum masuk kerja',
    future: 'Belum tiba',
};

const LEGEND_ITEMS: Array<{ status: CalendarDayStatus; label: string }> = [
    { status: 'present', label: attendanceStatusLabel('PRESENT') },
    { status: 'late', label: attendanceStatusLabel('LATE') },
    { status: 'paidLeave', label: 'Izin dibayar' },
    { status: 'deductibleLeave', label: 'Izin dipotong' },
    { status: 'absent', label: attendanceStatusLabel('ABSENT') },
    { status: 'missing', label: 'Tanpa catatan' },
    { status: 'sunday', label: 'Minggu / di luar masa kerja' },
];

export function AttendanceMonthCalendar({
    year,
    month,
    days,
    selectedDate,
    isInactiveEmployee = false,
    onSelectDate,
}: Props) {
    const firstUtcDay = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    const leadingBlanks = (firstUtcDay + 6) % 7;

    return (
        <div className="space-y-3 rounded-lg border p-3">
            <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-medium text-muted-foreground">
                {WEEKDAYS.map((day) => (
                    <div key={day} className="py-1">
                        {day}
                    </div>
                ))}
            </div>

            <div
                className="grid grid-cols-7 gap-1.5"
                role="grid"
                aria-label="Kalender kehadiran bulanan"
            >
                {Array.from({ length: leadingBlanks }, (_, idx) => (
                    <div key={`blank-${idx}`} aria-hidden="true" />
                ))}
                {days.map((entry) => {
                    const dayNum = Number(entry.date.slice(8, 10));
                    const isSelected = selectedDate === entry.date;
                    return (
                        <button
                            key={entry.date}
                            type="button"
                            onClick={() => onSelectDate(entry.date)}
                            aria-label={`${entry.date} — ${STATUS_LABELS[entry.status]}`}
                            aria-pressed={isSelected}
                            className={`relative flex h-10 flex-col items-center justify-center rounded-md border text-xs font-medium transition-shadow ${
                                STATUS_STYLES[entry.status]
                            } ${isSelected ? 'ring-2 ring-primary ring-offset-1' : ''}`}
                        >
                            <span>{dayNum}</span>
                            {entry.status === 'sunday' && entry.hasRecord && (
                                <span
                                    className="mt-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500"
                                    title="Ada catatan lembur hari Minggu"
                                />
                            )}
                        </button>
                    );
                })}
            </div>

            <div
                className="flex flex-wrap gap-x-3 gap-y-1.5 pt-1 text-[11px] text-muted-foreground"
                aria-label="Legenda kalender"
            >
                {LEGEND_ITEMS.map((item) => (
                    <span key={item.status} className="flex items-center gap-1.5">
                        <span
                            className={`inline-block h-3 w-3 rounded border ${STATUS_STYLES[item.status]}`}
                        />
                        {item.label}
                    </span>
                ))}
            </div>

            {isInactiveEmployee && (
                <p className="text-[11px] text-muted-foreground">
                    Karyawan berstatus nonaktif; hari kerja setelah tanggal
                    nonaktif dapat tampil sebagai tanpa catatan.
                </p>
            )}
        </div>
    );
}
