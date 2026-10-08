import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import SalesMobileVisitsHistoryClient from './visits-history-client';

export default async function SalesMobileVisitsHistoryPage() {
    const session = await auth();
    if (!session?.user?.id || !session.user.tenantId) redirect('/login');
    return (
        <SalesMobileVisitsHistoryClient
            partition={{
                tenantId: session.user.tenantId,
                userId: session.user.id,
            }}
        />
    );
}
