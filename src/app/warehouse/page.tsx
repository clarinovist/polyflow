import { getWarehouseShiftBoard } from '@/actions/dashboard/warehouse-dashboard';
import { WarehouseShiftBoardComponent } from '@/components/warehouse/WarehouseShiftBoard';

export const dynamic = 'force-dynamic';

export default async function WarehousePage() {
    const boardRes = await getWarehouseShiftBoard();

    return (
        <WarehouseShiftBoardComponent
            data={boardRes.success && boardRes.data ? boardRes.data : null}
        />
    );
}
