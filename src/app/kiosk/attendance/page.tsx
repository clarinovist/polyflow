import { getWorkShifts } from '@/actions/admin/work-shifts';
import { listKioskEmployees } from '@/actions/admin/attendance';
import { AttendanceKioskForm } from '@/components/hrd/AttendanceKioskForm';

export default async function KioskAttendancePage() {
  const [shiftsResult, employeesResult] = await Promise.all([
    getWorkShifts(),
    listKioskEmployees(),
  ]);

  const shifts = (shiftsResult.success ? shiftsResult.data ?? [] : [])
    .filter((s) => s.status === 'ACTIVE')
    .map((s) => ({
      id: s.id,
      name: s.name,
      startTime: s.startTime,
      endTime: s.endTime,
      plannedHours: s.plannedHours != null ? Number(s.plannedHours) : null,
    }));

  const employees = employeesResult.success ? employeesResult.data ?? [] : [];

  return (
    <div className="h-full flex flex-col p-4 md:p-6 max-w-4xl mx-auto">
      <AttendanceKioskForm shifts={shifts} employees={employees} />
    </div>
  );
}
