'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { setAbsent } from '@/actions/admin/attendance';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { attendanceStatusLabel } from '@/lib/hrd/attendance-status-label';
import type { NoRecordEmployee } from '@/services/hrd/attendance-roster-service';

export interface ShiftOption {
    id: string;
    name: string;
    status?: string;
}

interface Props {
    target: NoRecordEmployee | null;
    /** Hari kerja `YYYY-MM-DD`. */
    workDate: string;
    shifts: ShiftOption[];
    onClose: () => void;
    /** Dipanggil setelah record berhasil dibuat (muat ulang data di pemanggil). */
    onMarked: () => void;
}

const FALLBACK_ERROR = 'Gagal menandai tidak hadir. Coba lagi.';
const ACTIVE_STATUS = 'ACTIVE';

function formatWorkDate(workDate: string): string {
    return new Date(`${workDate}T00:00:00.000Z`).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
    });
}

function activeShifts(shifts: ShiftOption[]): ShiftOption[] {
    return shifts.filter((s) => s.status === undefined || s.status === ACTIVE_STATUS);
}

interface BodyProps extends Omit<Props, 'target'> {
    target: NoRecordEmployee;
    onBusyChange: (busy: boolean) => void;
}

function MarkAbsentBody({
    target,
    workDate,
    shifts,
    onClose,
    onMarked,
    onBusyChange,
}: BodyProps) {
    const options = activeShifts(shifts);
    const [shiftId, setShiftId] = useState(target.assignedShift?.id ?? '');
    const [isBusy, setIsBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inFlight = useRef(false);
    const hasNoShiftOptions = options.length === 0;

    const handleConfirm = async () => {
        if (inFlight.current || !shiftId) return;
        inFlight.current = true;
        setIsBusy(true);
        onBusyChange(true);
        setError(null);
        try {
            const res = await setAbsent(target.employeeId, workDate, shiftId);
            if (!res.success) {
                setError(('error' in res && res.error) || FALLBACK_ERROR);
                return;
            }
            toast.success(`${target.name} ditandai ${attendanceStatusLabel('ABSENT')}`);
            onMarked();
            onClose();
        } catch {
            setError(FALLBACK_ERROR);
        } finally {
            inFlight.current = false;
            setIsBusy(false);
            onBusyChange(false);
        }
    };

    return (
        <>
            <DialogHeader>
                <DialogTitle>Tandai tidak hadir</DialogTitle>
                <DialogDescription>
                    {target.name} ({target.code}) akan dicatat{' '}
                    {attendanceStatusLabel('ABSENT')} pada{' '}
                    {formatWorkDate(workDate)}. Catatan ini dapat memengaruhi
                    potongan gaji.
                </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2">
                <Label htmlFor="mark-absent-shift">Shift</Label>
                <NativeSelect
                    id="mark-absent-shift"
                    value={shiftId}
                    disabled={isBusy || hasNoShiftOptions}
                    onChange={(e) => setShiftId(e.target.value)}
                >
                    {!target.assignedShift && (
                        <option value="">Pilih shift…</option>
                    )}
                    {options.map((s) => (
                        <option key={s.id} value={s.id}>
                            {s.name}
                        </option>
                    ))}
                </NativeSelect>
                {hasNoShiftOptions && (
                    <p className="text-xs text-destructive">
                        Belum ada shift aktif. Buat shift terlebih dahulu.
                    </p>
                )}
                {!target.assignedShift && !hasNoShiftOptions && (
                    <p className="text-xs text-muted-foreground">
                        Karyawan ini belum punya shift pada tanggal tersebut.
                        Pilih shift yang akan ditandai tidak hadir.
                    </p>
                )}
                {error && (
                    <p role="alert" className="text-sm text-destructive">
                        {error}
                    </p>
                )}
            </div>
            <DialogFooter>
                <Button variant="outline" disabled={isBusy} onClick={onClose}>
                    Batal
                </Button>
                <Button
                    variant="destructive"
                    disabled={isBusy || !shiftId}
                    onClick={handleConfirm}
                >
                    {isBusy ? 'Menyimpan...' : 'Ya, tandai tidak hadir'}
                </Button>
            </DialogFooter>
        </>
    );
}

export function MarkAbsentDialog({ target, onClose, ...rest }: Props) {
    const [isBusy, setIsBusy] = useState(false);
    return (
        <Dialog
            open={!!target}
            onOpenChange={(open) => {
                if (!open && !isBusy) onClose();
            }}
        >
            <DialogContent>
                {target && (
                    <MarkAbsentBody
                        key={target.employeeId}
                        target={target}
                        onClose={onClose}
                        onBusyChange={setIsBusy}
                        {...rest}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}
