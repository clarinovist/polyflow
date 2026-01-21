'use client';

import { SalesMetrics } from '@/actions/analytics';
import { AnalyticsCards } from './AnalyticsCards';
import { RevenueChart } from './RevenueChart';
import { TopProductsList, TopCustomersList } from './TopLists';
import { Button } from '@/components/ui/button';
import { Download, RefreshCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface SalesAnalyticsClientProps {
    initialData: SalesMetrics;
}

export function SalesAnalyticsClient({ initialData }: SalesAnalyticsClientProps) {
    const router = useRouter();
    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleRefresh = () => {
        setIsRefreshing(true);
        router.refresh();
        setTimeout(() => setIsRefreshing(false), 1000);
    };

    return (
        <div className="flex flex-col gap-6 p-6">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Sales Analytics</h2>
                <div className="flex items-center space-x-2">
                    <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
                        <RefreshCcw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                    <Button size="sm">
                        <Download className="mr-2 h-4 w-4" />
                        Download Report
                    </Button>
                </div>
            </div>

            <AnalyticsCards data={initialData} />

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <RevenueChart data={initialData.revenueTrend} />
                <TopProductsList data={initialData} />
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <div className="col-span-4">
                    {/* Placeholder for future chart like Orders by Status */}
                </div>
                <TopCustomersList data={initialData} />
            </div>
        </div>
    );
}
