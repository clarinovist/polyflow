import { getPurchasingShiftBoard } from '@/actions/purchasing/purchasing-dashboard';
import { PurchasingShiftBoardComponent } from '@/components/purchasing/PurchasingShiftBoard';

export const dynamic = 'force-dynamic';

export default async function PurchasingHomePage() {
    const boardRes = await getPurchasingShiftBoard();
    const board = boardRes.success && boardRes.data
        ? boardRes.data
        : {
            counts: {
                pendingPrs: 0,
                draftPos: 0,
                awaitingReceiptPos: 0,
                partialPos: 0,
                overdueApCount: 0,
                overdueApAmount: 0,
                monthlySpend: 0,
            },
            attention: {
                agingPrs: [],
                draftPos: [],
                awaitingReceipt: [],
                partialPos: [],
                overdueAp: [],
                suggestedReorder: [],
            },
            performance: {
                monthlySpend: 0,
                topSupplierName: null,
                topSupplierSpend: 0,
            },
        };

    return <PurchasingShiftBoardComponent data={board} />;
}
