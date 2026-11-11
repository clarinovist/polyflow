'use client';

import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { attendanceStatusLabel } from '@/lib/hrd/attendance-status-label';
import {
    STALE_FILTER_LABEL,
    type StatusFilter,
} from './attendance-recap-helpers';

interface Props {
    status: StatusFilter;
    query: string;
    onStatusChange: (status: StatusFilter) => void;
    onQueryChange: (query: string) => void;
}

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
    { value: 'all', label: 'Semua status' },
    { value: 'present', label: attendanceStatusLabel('PRESENT') },
    { value: 'late', label: attendanceStatusLabel('LATE') },
    { value: 'leave', label: attendanceStatusLabel('ON_LEAVE') },
    { value: 'absent', label: attendanceStatusLabel('ABSENT') },
    { value: 'norecord', label: attendanceStatusLabel('NO_RECORD') },
    { value: 'outside', label: 'Di luar radius' },
    { value: 'nophoto', label: 'Tanpa selfie' },
    { value: 'stale', label: STALE_FILTER_LABEL },
];

/** Filter status + pencarian nama/kode untuk rekap harian. */
export function AttendanceFilterBar({
    status,
    query,
    onStatusChange,
    onQueryChange,
}: Props) {
    return (
        <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
                <label
                    htmlFor="attendance-status-filter"
                    className="text-sm font-medium text-muted-foreground"
                >
                    Status
                </label>
                <NativeSelect
                    id="attendance-status-filter"
                    className="w-[170px]"
                    value={status}
                    onChange={(e) =>
                        onStatusChange(e.target.value as StatusFilter)
                    }
                >
                    {STATUS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                            {o.label}
                        </option>
                    ))}
                </NativeSelect>
            </div>
            <Input
                type="search"
                aria-label="Cari karyawan"
                placeholder="Cari nama atau kode…"
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                className="w-[220px]"
            />
        </div>
    );
}
