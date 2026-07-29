import {
    listAttendance,
    getAttendanceSummary,
} from '@/actions/admin/attendance';
import { getWorkShifts } from '@/actions/admin/work-shifts';
import { AttendanceRecap } from '@/components/hrd/AttendanceRecap';
import { CalendarCheck, Settings } from 'lucide-react';
import { todayWibDateString } from '@/services/hrd/shift-window';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default async function AttendancePage({
    searchParams,
}: {
    searchParams: Promise<{ date?: string; shift?: string; ot?: string }>;
}) {
    const params = await searchParams;
    const dateStr = params.date || todayWibDateString();

    const [attendanceResult, summaryResult, shiftsResult] = await Promise.all([
        listAttendance(dateStr, {
            workShiftId: params.shift || undefined,
            overtimeOnly: params.ot === '1',
        }),
        getAttendanceSummary(dateStr),
        getWorkShifts(),
    ]);

    const records = attendanceResult.success
        ? (attendanceResult.data ?? [])
        : [];
    const summary = summaryResult.success ? (summaryResult.data ?? null) : null;
    const shifts = shiftsResult.success ? (shiftsResult.data ?? []) : [];

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <CalendarCheck className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black tracking-tight uppercase">
                            Rekap Absensi
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Ringkasan kehadiran karyawan per hari
                        </p>
                    </div>
                </div>
                <Link href="/dashboard/settings?tab=attendance">
                    <Button variant="outline" size="sm" className="gap-2">
                        <Settings className="h-4 w-4" />
                        Pengaturan Absensi
                    </Button>
                </Link>
            </div>

            <AttendanceRecap
                records={records}
                summary={summary}
                shifts={shifts}
                currentDate={dateStr}
                currentShift={params.shift}
                overtimeOnly={params.ot === '1'}
            />
        </div>
    );
}
