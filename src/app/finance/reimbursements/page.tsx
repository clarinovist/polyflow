import { listClaimPaymentAccounts } from '@/actions/sales/expense-claim-accounts';
import {
    listExpenseClaimsForPayment,
    listExpenseClaimsPaid,
} from '@/actions/sales/expense-claims';
import { PaidClaimsTable } from '@/components/finance/reimbursements/PaidClaimsTable';
import { ReimbursementQueue } from '@/components/finance/reimbursements/ReimbursementQueue';
import { ReimbursementTabs } from '@/components/finance/reimbursements/ReimbursementTabs';
import { ErrorAlert } from '@/components/ui/error-alert';
import { PageHeader } from '@/components/ui/page-header';
import { requireFinanceMutation } from '@/lib/auth/finance-access';
import { CLAIM_LIST_MAX_TAKE } from '@/lib/sales/expense-claim';
import { guardClaimPage } from '@/lib/sales/expense-claim-page-guard';
import { parseReimbursementTab } from '@/lib/sales/expense-claim-review';

type SearchParams = Promise<{ tab?: string | string[] }>;

async function QueueSection() {
    const [claimsResult, accountsResult] = await Promise.all([
        listExpenseClaimsForPayment({ take: CLAIM_LIST_MAX_TAKE }),
        listClaimPaymentAccounts(),
    ]);
    if (!claimsResult.success) return <ErrorAlert error={claimsResult.error} />;
    if (!accountsResult.success) {
        return <ErrorAlert error={accountsResult.error} />;
    }
    return (
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
    );
}

async function PaidSection() {
    const result = await listExpenseClaimsPaid({ take: CLAIM_LIST_MAX_TAKE });
    if (!result.success) return <ErrorAlert error={result.error} />;
    return (
        <>
            <PaidClaimsTable claims={result.data} />
            {result.data.length >= CLAIM_LIST_MAX_TAKE && (
                <p className="text-xs text-muted-foreground">
                    Menampilkan {CLAIM_LIST_MAX_TAKE} klaim dibayar terbaru.
                </p>
            )}
        </>
    );
}

export default async function FinanceReimbursementsPage({
    searchParams,
}: {
    searchParams?: SearchParams;
} = {}) {
    await guardClaimPage(requireFinanceMutation);

    const tab = parseReimbursementTab((await searchParams)?.tab);

    return (
        <div className="space-y-6 p-4 md:p-6 lg:p-8">
            <PageHeader
                title="Reimburse Sales"
                description="Klaim nota yang sudah disetujui dan menunggu pencairan. Pilih akun biaya dan akun sumber dana, lalu cairkan."
            />
            <ReimbursementTabs active={tab} />
            {tab === 'paid' ? await PaidSection() : await QueueSection()}
        </div>
    );
}
