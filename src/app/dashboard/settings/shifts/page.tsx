import { getWorkShifts } from '@/actions/work-shifts';
import { ShiftList } from '@/components/settings/ShiftList';
import { ShiftPageHeader } from '@/components/settings/ShiftPageHeader';

export default async function ShiftsPage() {
    const result = await getWorkShifts();
    const shifts = result.success && result.data ? result.data : [];

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8">
            <ShiftPageHeader />
            <ShiftList shifts={shifts} />
        </div>
    );
}
