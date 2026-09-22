import { getFinanceCustomerCreditDetail } from '@/actions/finance/sales-returns';
import { requireFinanceAccess } from '@/lib/auth/finance-access';
import { getUserRoles } from '@/lib/auth/roles';
import { CustomerCreditDetail } from '@/components/finance/returns/CustomerCreditDetail';
export const dynamic = 'force-dynamic';
export default async function CustomerCreditPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const result = await getFinanceCustomerCreditDetail(id);
    if (!result.success)
        return (
            <p role="alert">
                Saldo kredit tidak ditemukan atau akses tidak diizinkan.
            </p>
        );
    const session = await requireFinanceAccess();
    return (
        <CustomerCreditDetail
            note={result.data}
            canLink={getUserRoles(session.user).includes('ADMIN')}
        />
    );
}
