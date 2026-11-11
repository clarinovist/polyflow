import { auth } from '@/auth';
import { hasAnyRole } from '@/lib/auth/roles';
import {
    listAttendance,
    getAttendanceSummary,
} from '@/actions/admin/attendance';
import { getWorkShifts } from '@/actions/admin/work-shifts';
import { AttendanceRecap } from '@/components/hrd/AttendanceRecap';
import { parseStatusFilter } from '@/components/hrd/attendance/attendance-recap-helpers';
import { CalendarCheck, Settings } from 'lucide-react';
import { todayWibDateString } from '@/services/hrd/shift-window';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default async function AttendancePage({
    searchParams,
}: {
    searchParams: Promise<{
        date?: string;
        shift?: string;
        ot?: string;
        status?: string;
    }>;
}) {
    const params = await searchParams;
    const dateStr = params.date || todayWibDateString();
    // Kontrol koreksi massal hanya untuk ADMIN/HRD; server tetap otoritas.
    const session = await auth();
    const canBulkClose = hasAnyRole(session?.user, ['ADMIN', 'HRD']);

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
    // Gagal memuat bukan data kosong: teruskan pesan supaya UI menampilkan galat.
    const loadError = attendanceResult.success
        ? null
        : (attendanceResult.error ?? 'Gagal memuat data absensi');
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
                <Button asChild variant="outline" size="sm" className="gap-2">
                    <Link href="/dashboard/settings?tab=attendance">
                        <Settings className="h-4 w-4" />
                        Pengaturan Absensi
                    </Link>
                </Button>
            </div>

            <AttendanceRecap
                records={records}
                summary={summary}
                shifts={shifts}
                currentDate={dateStr}
                currentShift={params.shift}
                overtimeOnly={params.ot === '1'}
                initialStatus={parseStatusFilter(params.status)}
                loadError={loadError}
                canBulkClose={canBulkClose}
            />
        </div>
    );
}
