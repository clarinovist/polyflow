import { PageHeader } from '@/components/ui/page-header';
import { CollectionDashboardClient } from './CollectionDashboardClient';
import { serializeData } from '@/lib/utils/utils';
import {
    getSalesArAgingAction,
    getMyOverduePromisesAction,
    getInvoicesWithoutCollectionActivityAction,
} from '@/actions/sales/collection';
import { getSalesTeamAction } from '@/actions/sales/sales-team';

export default async function SalesCollectionPage() {
    const [agingRes, overdueRes, noActivityRes, teamRes] = await Promise.all([
        getSalesArAgingAction({}),
        getMyOverduePromisesAction(),
        getInvoicesWithoutCollectionActivityAction({}),
        getSalesTeamAction().catch(() => null),
    ]);

    type ActionRes<T = unknown> = { success?: boolean; data?: T };
    const aging =
        (agingRes as ActionRes)?.success && (agingRes as ActionRes).data
            ? serializeData((agingRes as ActionRes).data)
            : [];
    const overdue =
        (overdueRes as ActionRes)?.success && (overdueRes as ActionRes).data
            ? serializeData((overdueRes as ActionRes).data)
            : [];
    const noActivity =
        (noActivityRes as ActionRes)?.success &&
        (noActivityRes as ActionRes).data
            ? serializeData((noActivityRes as ActionRes).data)
            : [];
    const teamRaw = teamRes as ActionRes | null;
    const team =
        teamRaw?.success && teamRaw.data ? serializeData(teamRaw.data) : [];

    return (
        <div className="space-y-6">
            <PageHeader
                title="Penagihan"
                description="Matriks aging AR per sales, janji bayar jatuh tempo, dan piutang yang belum pernah ditindaklanjuti."
            />
            <CollectionDashboardClient
                initialAging={aging as never}
                initialOverdue={overdue as never}
                initialNoActivity={noActivity as never}
                initialTeam={team as never}
            />
        </div>
    );
}
