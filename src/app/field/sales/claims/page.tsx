import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getServerVisits } from '@/actions/sales/route-plans';
import { listMyExpenseClaims } from '@/actions/sales/expense-claims';
import { MobileReadError } from '@/components/mobile';
import { Button } from '@/components/ui/button';
import { formatWibDate } from '@/lib/utils/timezone';
import { ClaimHistoryList } from './ClaimHistoryList';
import { NewClaimForm, type ClaimVisitContext } from './NewClaimForm';

type SearchParams = Promise<{ visitId?: string | string[] }>;

function firstValue(value: string | string[] | undefined): string | null {
    const picked = Array.isArray(value) ? value[0] : value;
    return picked?.trim() ? picked.trim() : null;
}

/** Label comes from the user's recent visits; the server re-checks ownership on submit. */
async function resolveVisitContext(
    visitId: string | null,
): Promise<ClaimVisitContext | null> {
    if (!visitId) return null;
    const result = await getServerVisits();
    const visit = result.success
        ? result.data.find((item) => item.id === visitId)
        : undefined;
    return {
        id: visitId,
        label: visit
            ? `${visit.customerName}, ${formatWibDate(visit.checkInTime)}`
            : null,
    };
}

export default async function SalesMobileClaimsPage({
    searchParams,
}: {
    searchParams?: SearchParams;
}) {
    const visitId = firstValue((await searchParams)?.visitId);
    const [claimsResult, visit] = await Promise.all([
        listMyExpenseClaims(),
        resolveVisitContext(visitId),
    ]);

    if (!claimsResult.success) {
        return <MobileReadError title="Riwayat klaim belum tersedia" />;
    }

    return (
        <div className="space-y-4 p-4 pb-20">
            <div className="flex items-center gap-3">
                <Button
                    asChild
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                >
                    <Link href="/field/sales" aria-label="Kembali">
                        <ArrowLeft className="h-5 w-5" />
                    </Link>
                </Button>
                <div>
                    <h1 className="text-xl font-bold">Klaim Nota</h1>
                    <p className="text-sm text-muted-foreground">
                        Ajukan reimburse biaya lapangan
                    </p>
                </div>
            </div>
            <NewClaimForm visit={visit} />
            <ClaimHistoryList claims={claimsResult.data} />
        </div>
    );
}
