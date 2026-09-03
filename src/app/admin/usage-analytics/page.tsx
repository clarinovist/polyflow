import { fetchUsageAnalytics } from '@/actions/admin/usage-analytics';
import { UsageAnalyticsClient } from './usage-analytics-client';

export const metadata = {
    title: 'Usage Analytics | Super Admin',
    description: 'Adoption and feature usage metrics across PolyFlow tenants.',
};

export default async function UsageAnalyticsPage() {
    // 30d, not 7d: every adoption pattern worth acting on (a user's active-day
    // count, a feature nobody opens) is invisible in a 7-day window.
    const initialData = await fetchUsageAnalytics({ range: '30d' });

    return <UsageAnalyticsClient initialData={initialData} />;
}
