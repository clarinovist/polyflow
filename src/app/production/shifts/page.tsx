import { MobileReadError } from '@/components/mobile/MobileReadError';
import { PageHeader } from '@/components/ui/page-header';
import { getWorkShifts } from '@/actions/admin/work-shifts';
import { ShiftList } from '@/components/production/ShiftList';
import { ShiftPageHeader } from '@/components/production/ShiftPageHeader';

export default async function ShiftsPage() {
    const result = await getWorkShifts();
    if (!result.success || !result.data) return <MobileReadError title="Pengaturan shift gagal dimuat" />;
    const shifts = result.success && result.data ? result.data : [];

    return (
        <div className="min-w-0 space-y-6">
            <PageHeader title="Pengaturan Shift" description="Kelola nama shift dan jam kerja." actions={<ShiftPageHeader />} />
            <ShiftList shifts={shifts} />
        </div>
    );
}
