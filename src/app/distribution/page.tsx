import { getDistributionDashboard } from '@/actions/distribution/dashboard';
import { DistributionDashboard } from '@/components/distribution/DistributionDashboard';
import { unstable_rethrow } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function DistributionDashboardPage() {
    let result: Awaited<ReturnType<typeof getDistributionDashboard>> | null =
        null;
    try {
        result = await getDistributionDashboard();
    } catch (error) {
        unstable_rethrow(error);
    }

    return (
        <DistributionDashboard
            data={result?.success && result.data ? result.data : null}
        />
    );
}
