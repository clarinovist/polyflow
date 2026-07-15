import { getWorkShifts } from '@/actions/admin/work-shifts';
import { AttendanceKioskForm } from '@/components/hrd/AttendanceKioskForm';

export default async function KioskAttendancePage() {
  const shiftsResult = await getWorkShifts();
  const shifts = (shiftsResult.success ? shiftsResult.data ?? [] : [])
    .filter(s => s.status === 'ACTIVE')
    .map(s => ({
      id: s.id,
      name: s.name,
      startTime: s.startTime,
      endTime: s.endTime,
      plannedHours: s.plannedHours != null ? Number(s.plannedHours) : null,
    }));

  return (
    <div className="h-full flex flex-col p-4 md:p-6 max-w-4xl mx-auto">
      <AttendanceKioskForm shifts={shifts} />
    </div>
  );
}
