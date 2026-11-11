'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { recomputePayslipProration } from '@/actions/hrd/payroll-monthly';
import { AttendanceBasisPanel } from './AttendanceBasisPanel';
import {
    RecomputeProrationDialog,
    type RecomputeProrationTarget,
} from './RecomputeProrationDialog';

interface PayslipAttendanceSectionProps {
    payslip: {
        id: string;
        employeeName: string;
        status: 'DRAFT' | 'FINALIZED' | 'PAID';
        prorationDeduction: number;
    };
    /** Called after a successful recompute so the parent can reload payslips. */
    onRecomputed: () => void;
}

const FALLBACK_ERROR = 'Gagal menghitung ulang potongan absensi';

export function PayslipAttendanceSection({
    payslip,
    onRecomputed,
}: PayslipAttendanceSectionProps) {
    const [target, setTarget] = useState<RecomputeProrationTarget | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);

    // Throws on failure so RecomputeProrationDialog can show the server message.
    const confirmRecompute = async (id: string) => {
        const res = await recomputePayslipProration(id);
        if (!res.success) throw new Error(res.error || FALLBACK_ERROR);
        toast.success('Potongan absensi dihitung ulang');
        setTarget(null);
        setRefreshKey((k) => k + 1);
        onRecomputed();
    };

    return (
        <div className="border-t pt-3 space-y-2">
            <AttendanceBasisPanel
                payslipId={payslip.id}
                refreshKey={refreshKey}
            />
            {payslip.status === 'DRAFT' && (
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() =>
                        setTarget({
                            id: payslip.id,
                            employeeName: payslip.employeeName,
                            prorationDeduction: payslip.prorationDeduction,
                        })
                    }
                >
                    Hitung ulang potongan absensi
                </Button>
            )}
            <RecomputeProrationDialog
                target={target}
                onConfirm={confirmRecompute}
                onCancel={() => setTarget(null)}
            />
        </div>
    );
}
