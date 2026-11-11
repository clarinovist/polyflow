'use client';

import type { StaleOpenSession } from '@/services/hrd/attendance-query-service';
import { AttendanceStalePanel } from './AttendanceStalePanel';
import { CorrectAttendanceDialog } from './CorrectAttendanceDialog';
import { StaleClosurePreviewDialog } from './StaleClosurePreviewDialog';
import type { AttendanceRecord } from './attendance-recap-types';
import { useCorrectAttendance } from './useCorrectAttendance';
import { useStaleClosure } from './useStaleClosure';
import { useStaleOpenSessions } from './useStaleOpenSessions';

interface Props {
    /** Pencarian nama/kode dari filter rekap. */
    query: string;
    /** Dipanggil setelah koreksi tersimpan (mis. menyegarkan data halaman). */
    onCorrected?: () => void;
    /** Koreksi massal: hanya ADMIN/HRD (server tetap otoritas). */
    canBulkClose?: boolean;
}

/**
 * Bentuk record yang dibutuhkan dialog koreksi. Dialog hanya memakai id, nama,
 * dan jam masuk/pulang; sisanya hanya memenuhi tipe dan tidak ditampilkan.
 */
export function toCorrectableRecord(
    session: StaleOpenSession,
): AttendanceRecord {
    return {
        id: session.id,
        employeeId: session.employeeId,
        workShiftId: session.shift.id,
        employeeCode: session.employeeCode,
        employeeName: session.employeeName,
        shiftName: session.shift.name,
        plannedHours: 0,
        clockInAt: session.clockInAt,
        clockOutAt: null,
        actualHours: null,
        overtimeHours: 0,
        isOvertimeShift: false,
        status: 'PRESENT',
        source: '',
    };
}

/**
 * Panel "Sesi belum pulang" + dialog koreksi satuan, plus (ADMIN/HRD) koreksi
 * massal dengan pratinjau. Setelah koreksi tersimpan daftar dimuat ulang.
 */
export function AttendanceStaleSessions({
    query,
    onCorrected,
    canBulkClose = false,
}: Props) {
    const { state, reload } = useStaleOpenSessions(true);
    const refreshAll = () => {
        void reload();
        onCorrected?.();
    };
    const correction = useCorrectAttendance(refreshAll);
    const closure = useStaleClosure(refreshAll);

    return (
        <>
            <AttendanceStalePanel
                state={state}
                query={query}
                onRetry={reload}
                canBulkClose={canBulkClose}
                onPreviewClosure={closure.open}
                onCorrect={(session) =>
                    correction.open(toCorrectableRecord(session))
                }
            />
            {canBulkClose && (
                <StaleClosurePreviewDialog
                    phase={closure.phase}
                    onClose={closure.close}
                    onApply={closure.apply}
                    onRetry={closure.retry}
                />
            )}
            <CorrectAttendanceDialog
                record={correction.correcting}
                form={correction.form}
                loading={correction.loading}
                onFieldChange={correction.setField}
                onClose={correction.close}
                onSubmit={correction.submit}
            />
        </>
    );
}
