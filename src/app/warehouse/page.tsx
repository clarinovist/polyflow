import { getWarehouseShiftBoard } from '@/actions/dashboard/warehouse-dashboard';
import { WarehouseShiftBoardComponent } from '@/components/warehouse/WarehouseShiftBoard';

export const dynamic = 'force-dynamic';

export default async function WarehousePage() {
    const boardRes = await getWarehouseShiftBoard();
    const board = boardRes.success && boardRes.data ? boardRes.data : {
        counts: { receivablePOs: 0, openLoadOrders: 0, materialQueue: 0, lowStock: 0, suggestedReorder: 0 },
        today: { goodsReceipts: 0, deliveriesShipped: 0, materialIssues: 0 },
        attention: { loadingUnverified: [], partialPOs: [], waitingMaterial: [] },
    };

    return <WarehouseShiftBoardComponent data={board} />;
}
