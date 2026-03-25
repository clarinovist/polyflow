import { getExecutiveStats } from '@/actions/dashboard/dashboard';
import DashboardClient from './DashboardClient';
import { serializeData } from '@/lib/utils/utils';

export default async function DashboardPage() {
    const stats = await getExecutiveStats();

    return (
        <DashboardClient
            stats={serializeData(stats)}
        />
    );
}
