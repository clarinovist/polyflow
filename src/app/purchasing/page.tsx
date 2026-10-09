import { getPurchasingShiftBoard } from '@/actions/purchasing/purchasing-dashboard';
import { PurchasingShiftBoardComponent } from '@/components/purchasing/PurchasingShiftBoard';

export const dynamic = 'force-dynamic';

export default async function PurchasingHomePage() {
    const boardRes = await getPurchasingShiftBoard();
    return (
        <PurchasingShiftBoardComponent
            data={boardRes.success && boardRes.data ? boardRes.data : null}
        />
    );
}
