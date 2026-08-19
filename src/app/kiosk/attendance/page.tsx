import {
    listKioskEmployees,
    getKioskGeofenceMode,
} from '@/actions/admin/attendance';
import { AttendanceKioskForm } from '@/components/hrd/AttendanceKioskForm';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default async function KioskAttendancePage() {
    // Shift tidak lagi diambil di sini: server yang resolve dari
    // EmployeeShiftAssignment saat clock-in.
    const [employeesResult, geofenceModeResult] = await Promise.all([
        listKioskEmployees(),
        getKioskGeofenceMode(),
    ]);

    const employees = employeesResult.success
        ? (employeesResult.data ?? [])
        : [];

    const geofenceMode = geofenceModeResult.success
        ? (geofenceModeResult.data ?? 'off')
        : 'off';

    return (
        <div className="h-full flex flex-col p-4 md:p-6 max-w-4xl mx-auto space-y-4">
            <Link href="/kiosk">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10"
                    title="Kembali ke Hub"
                >
                    <ArrowLeft className="h-5 w-5" />
                </Button>
            </Link>
            <AttendanceKioskForm
                employees={employees}
                geofenceMode={geofenceMode}
            />
        </div>
    );
}
