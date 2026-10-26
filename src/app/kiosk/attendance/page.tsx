import {
    listKioskEmployees,
    getKioskGeofenceMode,
} from '@/actions/admin/attendance';
import { AttendanceKioskForm } from '@/components/hrd/AttendanceKioskForm';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { kioskButton } from '@/components/kiosk/ui/kiosk-button';
import { kioskLabels } from '@/lib/labels';

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
    // A failed load must not read as "no matching name".
    const employeesError = employeesResult.success
        ? undefined
        : 'Daftar karyawan gagal dimuat. Muat ulang halaman, atau hubungi admin bila tetap gagal.';

    const geofenceMode = geofenceModeResult.success
        ? (geofenceModeResult.data ?? 'off')
        : 'off';

    return (
        <div className="mx-auto grid h-full max-w-6xl content-start gap-4 p-4 md:p-6">
            <Link
                href="/kiosk"
                className={kioskButton({ tone: 'ghost', className: 'w-fit' })}
            >
                <ArrowLeft aria-hidden="true" /> {kioskLabels.jobsMenu}
            </Link>
            <AttendanceKioskForm
                employees={employees}
                employeesError={employeesError}
                geofenceMode={geofenceMode}
            />
        </div>
    );
}
