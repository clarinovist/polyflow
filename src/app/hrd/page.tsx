import { getHrdShiftBoard } from '@/actions/hrd/dashboard-kpis';
import { HrdShiftBoardComponent } from '@/components/hrd/HrdShiftBoard';

export const dynamic = 'force-dynamic';

export default async function HrdDashboardPage() {
    const boardRes = await getHrdShiftBoard().catch(() => null);

    return (
        <HrdShiftBoardComponent
            data={boardRes?.success && boardRes.data ? boardRes.data : null}
        />
    );
}
