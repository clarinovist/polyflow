import { listClaimPaymentAccounts } from '@/actions/sales/expense-claim-accounts';
import { listExpenseClaimsForPayment } from '@/actions/sales/expense-claims';
import { ReimbursementQueue } from '@/components/finance/reimbursements/ReimbursementQueue';
import { ErrorAlert } from '@/components/ui/error-alert';
import { PageHeader } from '@/components/ui/page-header';
import { requireFinanceMutation } from '@/lib/auth/finance-access';
import { CLAIM_LIST_MAX_TAKE } from '@/lib/sales/expense-claim';
import { guardClaimPage } from '@/lib/sales/expense-claim-page-guard';

export default async function FinanceReimbursementsPage() {
    await guardClaimPage(requireFinanceMutation);

    const [claimsResult, accountsResult] = await Promise.all([
        listExpenseClaimsForPayment({ take: CLAIM_LIST_MAX_TAKE }),
        listClaimPaymentAccounts(),
    ]);

    return (
        <div className="space-y-6 p-4 md:p-6 lg:p-8">
            <PageHeader
                title="Reimburse Sales"
                description="Klaim nota yang sudah disetujui dan menunggu pencairan. Pilih akun biaya dan akun sumber dana, lalu cairkan."
            />
            {claimsResult.success && accountsResult.success ? (
                <>
                    <ReimbursementQueue
                        claims={claimsResult.data}
                        accounts={accountsResult.data}
                    />
                    {claimsResult.data.length >= CLAIM_LIST_MAX_TAKE && (
                        <p className="text-xs text-muted-foreground">
                            Menampilkan {CLAIM_LIST_MAX_TAKE} klaim terlama.
                        </p>
                    )}
                </>
            ) : (
                <ErrorAlert
                    error={
                        !claimsResult.success
                            ? claimsResult.error
                            : !accountsResult.success
                              ? accountsResult.error
                              : null
                    }
                />
            )}
        </div>
    );
}
