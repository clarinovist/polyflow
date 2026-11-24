import {
    getExpenseClaimCounts,
    listExpenseClaimsForReview,
} from '@/actions/sales/expense-claims';
import { ClaimReviewTable } from '@/components/sales/claims/ClaimReviewTable';
import { ClaimStatusTabs } from '@/components/sales/claims/ClaimStatusTabs';
import { ErrorAlert } from '@/components/ui/error-alert';
import { PageHeader } from '@/components/ui/page-header';
import { requireSalesManager } from '@/lib/auth/sales-access';
import { CLAIM_LIST_MAX_TAKE } from '@/lib/sales/expense-claim';
import { guardClaimPage } from '@/lib/sales/expense-claim-page-guard';
import { parseReviewStatus } from '@/lib/sales/expense-claim-review';

type SearchParams = Promise<{ status?: string | string[] }>;

export default async function SalesClaimsPage({
    searchParams,
}: {
    searchParams?: SearchParams;
}) {
    await guardClaimPage(requireSalesManager);

    const status = parseReviewStatus((await searchParams)?.status);
    const [claimsResult, countsResult] = await Promise.all([
        listExpenseClaimsForReview({ status, take: CLAIM_LIST_MAX_TAKE }),
        getExpenseClaimCounts(),
    ]);
    const pendingCount = countsResult.success
        ? countsResult.data.submitted
        : null;

    return (
        <div className="space-y-6 p-4 md:p-6 lg:p-8">
            <PageHeader
                title="Klaim Reimburse"
                description="Tinjau klaim nota biaya lapangan dari tim sales. Klaim yang disetujui dicairkan oleh Finance."
            />
            <ClaimStatusTabs active={status} pendingCount={pendingCount} />
            {claimsResult.success ? (
                <>
                    <ClaimReviewTable
                        claims={claimsResult.data}
                        status={status}
                    />
                    {claimsResult.data.length >= CLAIM_LIST_MAX_TAKE && (
                        <p className="text-xs text-muted-foreground">
                            Menampilkan maksimal {CLAIM_LIST_MAX_TAKE} klaim.
                        </p>
                    )}
                </>
            ) : (
                <ErrorAlert error={claimsResult.error} />
            )}
        </div>
    );
}
