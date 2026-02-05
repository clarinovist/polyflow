import { Suspense } from 'react';
import { getSalesMetrics } from '@/actions/analytics';
import { SalesAnalyticsClient } from '@/components/sales/analytics/SalesAnalyticsClient';
import { Loader2 } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function SalesAnalyticsPage() {
    const metrics = await getSalesMetrics(30);

    return (
        <Suspense fallback={
            <div className="flex h-full w-full items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        }>
            <SalesAnalyticsClient initialData={metrics} />
        </Suspense>
    );
}
