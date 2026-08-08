import { PageHeader } from '@/components/ui/page-header';
import { SalesTargetsClient } from './SalesTargetsClient';
import { serializeData } from '@/lib/utils/utils';
import {
    getTargetsForPeriodAction,
    getTargetContextAction,
    getCompanyTargetAction,
} from '@/actions/sales/sales-targets';
import { getSalesTeamAction } from '@/actions/sales/sales-team';

export default async function SalesTargetsPage() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const teamRes = await getSalesTeamAction();
    const team =
        teamRes?.success && teamRes.data ? serializeData(teamRes.data) : [];

    // Normalize team ke { id, name }
    const teamNormalized = (team as { id: string; name?: string | null }[]).map(
        (t) => ({
            id: t.id,
            name: (t as { name?: string | null }).name ?? null,
        }),
    );
    const teamIds = teamNormalized.map((t) => t.id);

    const [targetsRes, contextRes, companyTargetRes] = await Promise.all([
        getTargetsForPeriodAction(year, month),
        getTargetContextAction(teamIds, year, month),
        getCompanyTargetAction(year, month),
    ]);

    const targets =
        targetsRes?.success && targetsRes.data
            ? serializeData(targetsRes.data)
            : [];

    const context =
        contextRes?.success && contextRes.data
            ? serializeData(contextRes.data)
            : [];

    const companyTarget =
        companyTargetRes?.success && companyTargetRes.data
            ? ((companyTargetRes.data as { value: number | null }).value ??
              null)
            : null;

    return (
        <div className="space-y-6">
            <PageHeader
                title="Target Sales"
                description="Atur target omzet bulanan dan target kunjungan per sales. Pantau pencapaian berjalan terhadap target dengan konteks historis dan pacing. Basis omzet operasional = SALES_ORDER (non-batal) termasuk retur periode ini."
            />
            <SalesTargetsClient
                initialData={targets as never}
                initialYear={year}
                initialMonth={month}
                initialTeam={teamNormalized}
                initialContext={context as never}
                initialCompanyTarget={companyTarget}
            />
        </div>
    );
}
