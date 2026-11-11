'use client';

import { attendanceStatusLabel } from '@/lib/hrd/attendance-status-label';
import type {
    AttendanceSummaryCounts,
    StatusFilter,
} from './attendance-recap-helpers';

interface Props {
    counts: AttendanceSummaryCounts;
    active: StatusFilter;
    isNonWorkingDay: boolean;
    onSelect: (status: StatusFilter) => void;
}

interface ChipSpec {
    filter: StatusFilter;
    label: string;
    value: string;
    isAnomaly?: boolean;
}

const UNAVAILABLE = '…';
const HOLIDAY_NOTE = 'Libur';

function noRecordValue(
    counts: AttendanceSummaryCounts,
    isNonWorkingDay: boolean,
): string {
    if (isNonWorkingDay) return HOLIDAY_NOTE;
    return counts.noRecord === null ? UNAVAILABLE : String(counts.noRecord);
}

function buildChips(
    counts: AttendanceSummaryCounts,
    isNonWorkingDay: boolean,
): ChipSpec[] {
    const chips: ChipSpec[] = [
        { filter: 'present', label: attendanceStatusLabel('PRESENT'), value: String(counts.present) },
        { filter: 'late', label: attendanceStatusLabel('LATE'), value: String(counts.late) },
        { filter: 'leave', label: attendanceStatusLabel('ON_LEAVE'), value: String(counts.onLeave) },
        { filter: 'absent', label: attendanceStatusLabel('ABSENT'), value: String(counts.absent) },
        {
            filter: 'norecord',
            label: attendanceStatusLabel('NO_RECORD'),
            value: noRecordValue(counts, isNonWorkingDay),
        },
    ];
    if (counts.outsideRadius > 0) {
        chips.push({ filter: 'outside', label: 'Di luar radius', value: String(counts.outsideRadius), isAnomaly: true });
    }
    if (counts.noSelfie > 0) {
        chips.push({ filter: 'nophoto', label: 'Tanpa selfie', value: String(counts.noSelfie), isAnomaly: true });
    }
    return chips;
}

function chipClass(isActive: boolean, isAnomaly: boolean | undefined): string {
    const base =
        'flex items-baseline gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors';
    if (isActive) return `${base} bg-primary text-primary-foreground border-primary`;
    if (isAnomaly) return `${base} border-orange-500/40 text-orange-600 hover:bg-orange-500/10`;
    return `${base} bg-card hover:bg-muted`;
}

/** Ringkasan status hari itu sebagai chip yang bisa diklik untuk memfilter. */
export function AttendanceSummaryChips({
    counts,
    active,
    isNonWorkingDay,
    onSelect,
}: Props) {
    return (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Ringkasan status absensi">
            {buildChips(counts, isNonWorkingDay).map((chip) => {
                const isActive = active === chip.filter;
                return (
                    <button
                        key={chip.filter}
                        type="button"
                        aria-pressed={isActive}
                        className={chipClass(isActive, chip.isAnomaly)}
                        onClick={() => onSelect(isActive ? 'all' : chip.filter)}
                    >
                        <span className="font-medium">{chip.label}</span>
                        {' '}
                        <span className="font-bold tabular-nums">{chip.value}</span>
                    </button>
                );
            })}
        </div>
    );
}
