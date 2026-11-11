'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AttendanceLoadError } from './AttendanceLoadError';
import { MarkAbsentDialog, type ShiftOption } from './MarkAbsentDialog';
import { isFutureWorkDate } from './attendance-recap-helpers';
import type { NoRecordEmployee } from '@/services/hrd/attendance-roster-service';
import type { NoRecordRosterState } from './useNoRecordRoster';

export type { NoRecordRosterState } from './useNoRecordRoster';

interface Props {
    state: NoRecordRosterState;
    workDate: string;
    shifts: ShiftOption[];
    /** Pencarian nama/kode dari filter rekap. */
    query: string;
    onRetry: () => void;
    onMarked: () => void;
}

function matchesQuery(employee: NoRecordEmployee, query: string): boolean {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return (
        employee.name.toLowerCase().includes(needle) ||
        employee.code.toLowerCase().includes(needle)
    );
}

function PanelMessage({ children }: { children: React.ReactNode }) {
    return (
        <div className="bg-card rounded-xl border p-8 text-center text-muted-foreground">
            {children}
        </div>
    );
}

function LoadingSkeleton() {
    return (
        <div
            role="status"
            aria-busy="true"
            className="bg-card rounded-xl border p-4 space-y-3"
        >
            <span className="sr-only">Memuat daftar belum absen…</span>
            {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
            ))}
        </div>
    );
}

interface RowProps {
    employee: NoRecordEmployee;
    canMark: boolean;
    onMark: (employee: NoRecordEmployee) => void;
}

function NoRecordRow({ employee, canMark, onMark }: RowProps) {
    return (
        <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
                <p className="font-medium truncate">{employee.name}</p>
                <p className="text-xs text-muted-foreground">
                    <span>{employee.code}</span>
                    {' · '}
                    {employee.assignedShift ? (
                        <span>{employee.assignedShift.name}</span>
                    ) : (
                        <span>Belum ada shift</span>
                    )}
                </p>
            </div>
            <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!canMark}
                onClick={() => onMark(employee)}
            >
                Tandai tidak hadir
            </Button>
        </li>
    );
}

/** Daftar "Belum absen" + dialog Tandai tidak hadir (memanggil setAbsent). */
export function AttendanceNoRecordPanel({
    state,
    workDate,
    shifts,
    query,
    onRetry,
    onMarked,
}: Props) {
    const [target, setTarget] = useState<NoRecordEmployee | null>(null);
    const employees = useMemo(
        () =>
            state.status === 'ready'
                ? state.data.employees.filter((e) => matchesQuery(e, query))
                : [],
        [state, query],
    );

    if (state.status === 'loading') return <LoadingSkeleton />;
    if (state.status === 'error') {
        return <AttendanceLoadError message={state.message} onRetry={onRetry} />;
    }
    if (state.data.isNonWorkingDay) {
        return (
            <PanelMessage>
                Hari libur (Minggu) — tidak ada karyawan yang perlu absen.
            </PanelMessage>
        );
    }
    if (state.data.employees.length === 0) {
        return (
            <PanelMessage>
                Semua karyawan aktif sudah punya catatan absensi.
            </PanelMessage>
        );
    }

    const isFuture = isFutureWorkDate(workDate);
    return (
        <div className="space-y-2">
            {isFuture && (
                <p className="text-xs text-muted-foreground">
                    Tanggal ini belum tiba, jadi belum bisa ditandai tidak hadir.
                </p>
            )}
            {employees.length === 0 ? (
                <PanelMessage>Tidak ada karyawan yang cocok dengan pencarian.</PanelMessage>
            ) : (
                <ul className="bg-card rounded-xl border divide-y max-h-[28rem] overflow-y-auto">
                    {employees.map((e) => (
                        <NoRecordRow
                            key={e.employeeId}
                            employee={e}
                            canMark={!isFuture}
                            onMark={setTarget}
                        />
                    ))}
                </ul>
            )}
            <MarkAbsentDialog
                target={target}
                workDate={workDate}
                shifts={shifts}
                onClose={() => setTarget(null)}
                onMarked={onMarked}
            />
        </div>
    );
}
