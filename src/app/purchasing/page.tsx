import { getPurchasingShiftBoard } from '@/actions/purchasing/purchasing-dashboard';
import { PurchasingShiftBoardComponent } from '@/components/purchasing/PurchasingShiftBoard';
import { auth } from '@/auth';
import { isReadOnlyFactoryManager } from '@/lib/auth/read-only-role';

export const dynamic = 'force-dynamic';

export default async function PurchasingHomePage() {
    const [boardRes, session] = await Promise.all([
        getPurchasingShiftBoard(),
        auth(),
    ]);
    return (
        <PurchasingShiftBoardComponent
            data={boardRes.success && boardRes.data ? boardRes.data : null}
            canCreateOrder={!isReadOnlyFactoryManager(session?.user)}
        />
    );
}
