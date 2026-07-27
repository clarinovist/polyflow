import { fetchUsageAnalytics } from '@/actions/admin/usage-analytics';
import { UsageAnalyticsClient } from './usage-analytics-client';

export const metadata = {
    title: 'Usage Analytics | Super Admin',
    description: 'Adoption and feature usage metrics across PolyFlow tenants.',
};

export default async function UsageAnalyticsPage() {
    const initialData = await fetchUsageAnalytics({ range: '7d' });

    return <UsageAnalyticsClient initialData={initialData} />;
}
