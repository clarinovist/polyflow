'use client';

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

export interface GenerateWarning {
    employeeId: string;
    employeeName: string;
    missingDays: number;
}

interface GenerateWarningsDialogProps {
    warnings: GenerateWarning[];
    onClose: () => void;
}

export function GenerateWarningsDialog({
    warnings,
    onClose,
}: GenerateWarningsDialogProps) {
    return (
        <Dialog
            open={warnings.length > 0}
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
        >
            <DialogContent mobileSheet showCloseButton={false}>
                <DialogHeader>
                    <DialogTitle>Periksa absensi sebelum finalisasi</DialogTitle>
                    <DialogDescription>
                        {warnings.length} karyawan punya hari kerja tanpa
                        catatan absensi. Hari-hari ini tidak dipotong otomatis.
                    </DialogDescription>
                </DialogHeader>
                <ul className="max-h-60 space-y-1 overflow-y-auto text-sm">
                    {warnings.map((w) => (
                        <li
                            key={w.employeeId}
                            className="flex justify-between gap-4"
                        >
                            <span>{w.employeeName}</span>
                            <span className="font-medium">
                                {w.missingDays} hari
                            </span>
                        </li>
                    ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                    Libur nasional tidak dikenali, jadi hari libur ikut
                    terhitung di sini. Tandai alpa/izin pada absensi lalu
                    gunakan &quot;Hitung ulang potongan absensi&quot; di detail
                    slip bila perlu.
                </p>
                <DialogFooter>
                    <Button type="button" onClick={onClose}>
                        Mengerti
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
