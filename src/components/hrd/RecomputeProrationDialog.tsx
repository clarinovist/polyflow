'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { formatIdr } from './payslipFormat';

export interface RecomputeProrationTarget {
    id: string;
    employeeName: string;
    prorationDeduction: number;
}

interface RecomputeProrationDialogProps {
    target: RecomputeProrationTarget | null;
    /** Must reject with an Error carrying the server message on failure. */
    onConfirm: (id: string) => Promise<void>;
    onCancel: () => void;
}

const FALLBACK_ERROR = 'Gagal menghitung ulang potongan absensi';

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between gap-4 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-medium">{value}</span>
        </div>
    );
}

function RecomputeBody({
    target,
    onConfirm,
    onCancel,
    onBusyChange,
}: RecomputeProrationDialogProps & {
    target: RecomputeProrationTarget;
    onBusyChange: (busy: boolean) => void;
}) {
    const [isBusy, setIsBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inFlight = useRef(false);

    const handleConfirm = async () => {
        if (inFlight.current) return;
        inFlight.current = true;
        setIsBusy(true);
        onBusyChange(true);
        setError(null);
        try {
            await onConfirm(target.id);
        } catch (err) {
            const message =
                err instanceof Error && err.message
                    ? err.message
                    : FALLBACK_ERROR;
            setError(message);
            toast.error(message);
        } finally {
            inFlight.current = false;
            setIsBusy(false);
            onBusyChange(false);
        }
    };

    return (
        <>
            <DialogHeader>
                <DialogTitle>Hitung Ulang Potongan Absensi</DialogTitle>
                <DialogDescription>
                    Potongan dihitung ulang dari data absensi dan izin saat
                    ini. Nilai yang diisi manual akan ditimpa, dan perubahan
                    yang belum disimpan di form koreksi akan hilang.
                </DialogDescription>
            </DialogHeader>
            <div className="space-y-1">
                <Row label="Karyawan" value={target.employeeName} />
                <Row
                    label="Potongan absensi saat ini"
                    value={formatIdr(target.prorationDeduction)}
                />
            </div>
            {error && (
                <p role="alert" className="text-sm text-red-600">
                    {error}
                </p>
            )}
            <DialogFooter>
                <Button
                    type="button"
                    variant="ghost"
                    disabled={isBusy}
                    onClick={onCancel}
                >
                    Batal
                </Button>
                <Button
                    type="button"
                    disabled={isBusy}
                    onClick={handleConfirm}
                >
                    {isBusy ? 'Memproses…' : 'Hitung ulang'}
                </Button>
            </DialogFooter>
        </>
    );
}

export function RecomputeProrationDialog(props: RecomputeProrationDialogProps) {
    const { target, onCancel } = props;
    const busyRef = useRef(false);
    return (
        <Dialog
            open={target !== null}
            onOpenChange={(open) => {
                if (!open && !busyRef.current) onCancel();
            }}
        >
            <DialogContent mobileSheet showCloseButton={false}>
                {target && (
                    <RecomputeBody
                        key={target.id}
                        {...props}
                        target={target}
                        onBusyChange={(busy) => {
                            busyRef.current = busy;
                        }}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}
