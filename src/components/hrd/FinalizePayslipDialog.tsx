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

export interface FinalizePayslipTarget {
    id: string;
    employeeName: string;
    loanDeduction: number;
    netPay: number;
}

interface FinalizePayslipDialogProps {
    target: FinalizePayslipTarget | null;
    periodLabel?: string;
    /** Must reject with an Error carrying the server message on failure. */
    onConfirm: (id: string) => Promise<void>;
    onCancel: () => void;
}

const FALLBACK_ERROR = 'Gagal memfinalisasi slip gaji';

function formatIdr(n: number): string {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
    }).format(n);
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between gap-4 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-medium">{value}</span>
        </div>
    );
}

function FinalizeBody({
    target,
    periodLabel,
    onConfirm,
    onCancel,
    onBusyChange,
}: FinalizePayslipDialogProps & {
    target: FinalizePayslipTarget;
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
                <DialogTitle>Finalisasi Slip Gaji</DialogTitle>
                <DialogDescription>
                    Setelah difinalisasi, potongan kasbon langsung dipotong
                    dari saldo kasbon karyawan.
                </DialogDescription>
            </DialogHeader>
            <div className="space-y-1">
                <Row label="Karyawan" value={target.employeeName} />
                {periodLabel && <Row label="Periode" value={periodLabel} />}
                <Row
                    label="Potongan kasbon"
                    value={formatIdr(target.loanDeduction)}
                />
                <Row label="Gaji bersih" value={formatIdr(target.netPay)} />
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
                    {isBusy ? 'Memproses…' : 'Konfirmasi'}
                </Button>
            </DialogFooter>
        </>
    );
}

export function FinalizePayslipDialog(props: FinalizePayslipDialogProps) {
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
                    <FinalizeBody
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
