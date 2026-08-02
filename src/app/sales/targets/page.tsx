import { PageHeader } from '@/components/ui/page-header';
import { SalesTargetsClient } from './SalesTargetsClient';
import { serializeData } from '@/lib/utils/utils';
import { getTargetsForPeriodAction } from '@/actions/sales/sales-targets';
import { getSalesTeamAction } from '@/actions/sales/sales-team';

export default async function SalesTargetsPage() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const [targetsRes, teamRes] = await Promise.all([
        getTargetsForPeriodAction(year, month),
        getSalesTeamAction(),
    ]);

    const targets =
        targetsRes?.success && targetsRes.data
            ? serializeData(targetsRes.data)
            : [];

    const team =
        teamRes?.success && teamRes.data ? serializeData(teamRes.data) : [];

    // Normalize team ke { id, name }
    const teamNormalized = (team as { id: string; name?: string | null }[]).map(
        (t) => ({
            id: t.id,
            name: (t as { name?: string | null }).name ?? null,
        }),
    );

    return (
        <div className="space-y-6">
            <PageHeader
                title="Target Sales"
                description="Atur target omzet bulanan dan target kunjungan per sales. Pantau pencapaian berjalan terhadap target. Basis omzet operasional = SALES_ORDER (non-batal) termasuk retur periode ini."
            />
            <SalesTargetsClient
                initialData={targets as never}
                initialYear={year}
                initialMonth={month}
                initialTeam={teamNormalized}
            />
        </div>
    );
}
