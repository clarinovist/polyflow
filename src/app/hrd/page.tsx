import { getHrdShiftBoard } from '@/actions/hrd/dashboard-kpis';
import { HrdShiftBoardComponent } from '@/components/hrd/HrdShiftBoard';
import { logger } from '@/lib/config/logger';

export const dynamic = 'force-dynamic';

const LOG_MODULE = 'hrd-dashboard';

type BoardResult = Awaited<ReturnType<typeof getHrdShiftBoard>>;

/** A failed load is logged and shown as an error state, never as empty data. */
async function loadBoard(): Promise<BoardResult | null> {
    try {
        return await getHrdShiftBoard();
    } catch (error) {
        logger.error('Dashboard HRD gagal dimuat', {
            module: LOG_MODULE,
            error,
        });
        return null;
    }
}

export default async function HrdDashboardPage() {
    const boardRes = await loadBoard();
    if (boardRes && !boardRes.success) {
        logger.error('Dashboard HRD ditolak atau gagal', {
            module: LOG_MODULE,
            code: boardRes.code,
        });
    }

    return (
        <HrdShiftBoardComponent
            data={boardRes?.success && boardRes.data ? boardRes.data : null}
        />
    );
}
