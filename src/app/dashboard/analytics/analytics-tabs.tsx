'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    ProductionRealizationItem,
    MaterialUsageVarianceItem,
    MachinePerformanceItem,
    OperatorProductivityItem,
    QualityControlSummary
} from '@/types/analytics';

// Sub-components (Will create these next)
import { ProductionRealizationTable } from '@/components/analytics/ProductionRealizationTable';
import { MaterialVarianceTable } from '@/components/analytics/MaterialVarianceTable';
import { MachinePerformanceChart } from '@/components/analytics/MachinePerformanceChart';
import { OperatorLeaderboard } from '@/components/analytics/OperatorLeaderboard';
import { QualityControlWidget } from '@/components/analytics/QualityControlWidget';
import { DateRange } from '@/types/analytics';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

interface AnalyticsTabsProps {
    defaultTab: string;
    data: {
        productionRealization: any; // Cast in component
        materialVariance: any;
        machinePerformance: any;
        operatorLeaderboard: any;
        qualitySummary: any;
    };
    dateRange: { from: Date | string; to: Date | string };
}

export default function AnalyticsTabs({ defaultTab, data, dateRange }: AnalyticsTabsProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [activeTab, setActiveTab] = useState(defaultTab);

    const handleTabChange = (value: string) => {
        setActiveTab(value);
        const params = new URLSearchParams(searchParams.toString());
        params.set('tab', value);
        router.push(`?${params.toString()}`, { scroll: false });
    };

    return (
        <Tabs defaultValue={defaultTab} onValueChange={handleTabChange} className="space-y-6">
            <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 lg:w-[800px]">
                <TabsTrigger value="production">Production</TabsTrigger>
                <TabsTrigger value="materials">Materials</TabsTrigger>
                <TabsTrigger value="machines">Machines</TabsTrigger>
                <TabsTrigger value="operators">Operators</TabsTrigger>
                <TabsTrigger value="quality">Quality</TabsTrigger>
            </TabsList>

            <TabsContent value="production" className="space-y-4">
                <ProductionRealizationTable
                    data={data.productionRealization as ProductionRealizationItem[]}
                />
            </TabsContent>

            <TabsContent value="materials" className="space-y-4">
                <MaterialVarianceTable
                    data={data.materialVariance as MaterialUsageVarianceItem[]}
                />
            </TabsContent>

            <TabsContent value="machines" className="space-y-4">
                {activeTab === 'machines' && (
                    <MachinePerformanceChart
                        data={data.machinePerformance as MachinePerformanceItem[]}
                    />
                )}
            </TabsContent>

            <TabsContent value="operators" className="space-y-4">
                <OperatorLeaderboard
                    data={data.operatorLeaderboard as OperatorProductivityItem[]}
                />
            </TabsContent>

            <TabsContent value="quality" className="space-y-4">
                {activeTab === 'quality' && (
                    <QualityControlWidget
                        data={data.qualitySummary as QualityControlSummary}
                    />
                )}
            </TabsContent>
        </Tabs>
    );
}
