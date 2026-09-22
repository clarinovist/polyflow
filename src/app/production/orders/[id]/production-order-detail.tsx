'use client';

import {
    Machine,
    Location,
    ProductVariant,
    Employee,
    WorkShift,
} from '@prisma/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useState, useEffect } from 'react';
import { getOrderCosting } from '@/actions/finance/finance';

import { ExtendedProductionOrder } from '@/components/production/order-detail/types';
import { OrderWorkflowStepper } from '@/components/production/order-detail/OrderWorkflowStepper';

import { OrderOverviewTab } from './components/order-overview-tab';
import { OrderExecutionTab } from './components/order-execution-tab';
import { OrderIssuesTab } from './components/order-issues-tab';
import {
    OrderCostingTab,
    type OrderCostingData,
} from './components/order-costing-tab';
import { OrderDetailHeader } from './components/order-detail-header';
import { EntityStatusTimeline } from '@/components/shared/EntityStatusTimeline';
import type { MachineStageMap } from '@/lib/production/machine-compatibility';
import { OrderContextSummary } from '@/components/production/OrderContextSummary';
import { OrderCustomersEditor } from '@/components/production/order-detail/OrderCustomersEditor';
import type { CustomerDestination } from '@/lib/production/order-context';

interface PageProps {
    order: ExtendedProductionOrder;
    canEditCustomers?: boolean;
    formData: {
        locations: Location[];
        operators: Employee[];
        helpers: Employee[];
        workShifts: WorkShift[];
        machines: Machine[];
        rawMaterials: ProductVariant[];
        machineStageMap?: MachineStageMap | null;
        customers?: CustomerDestination[];
    };
}

export function ProductionOrderDetail({
    order,
    formData,
    canEditCustomers = false,
}: PageProps) {
    const getDefaultTab = (status: string) => {
        switch (status) {
            case 'WAITING_MATERIAL':
                return 'overview';
            case 'RELEASED':
                return 'overview';
            case 'IN_PROGRESS':
                return 'execution';
            default:
                return 'overview';
        }
    };

    const [activeTab, setActiveTab] = useState(getDefaultTab(order.status));

    const [costingData, setCostingData] = useState<OrderCostingData>(null);
    const [loadingCosting, setLoadingCosting] = useState(false);

    useEffect(() => {
        if (activeTab === 'issues_costing' && !costingData) {
            setLoadingCosting(true);
            getOrderCosting(order.id)
                .then((res) => setCostingData(res.success ? res.data : null))
                .finally(() => setLoadingCosting(false));
        }
    }, [activeTab, order.id, costingData]);

    const openIssueCount =
        order.issues?.filter((i) => i.status === 'OPEN').length || 0;

    return (
        <div className="space-y-4">
            <OrderDetailHeader order={order} formData={formData} />

            <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-card px-4 py-3">
                <OrderContextSummary
                    order={order}
                    standards={order.bom.productVariant.qualityCheckParameters}
                />
                {canEditCustomers &&
                    !['COMPLETED', 'CANCELLED'].includes(order.status) && (
                        <OrderCustomersEditor
                            orderId={order.id}
                            customers={formData.customers ?? []}
                            selected={(order.customerDestinations ?? []).map(
                                (row) => row.customer,
                            )}
                        />
                    )}
            </div>

            <OrderWorkflowStepper status={order.status} />

            <details className="rounded-lg border bg-card">
                <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-medium">
                    Riwayat status SPK
                </summary>
                <div className="border-t p-3">
                    <EntityStatusTimeline
                        entityType="ProductionOrder"
                        entityId={order.id}
                    />
                </div>
            </details>

            <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                className="w-full"
            >
                <div className="overflow-x-auto pb-2 custom-scrollbar">
                    <TabsList className="flex h-auto w-max min-w-full justify-start gap-1 bg-muted/50 p-1">
                        <TabsTrigger value="overview" className="min-h-11 px-4">
                            Operasional
                        </TabsTrigger>

                        <TabsTrigger
                            value="execution"
                            className="relative min-h-11 px-4"
                        >
                            Bahan, tim & kualitas
                            {order.status === 'IN_PROGRESS' && (
                                <span className="absolute top-1 right-1 w-2 h-2 bg-amber-500 rounded-full animate-pulse dark:bg-amber-400" />
                            )}
                        </TabsTrigger>

                        <TabsTrigger
                            value="issues_costing"
                            className="relative min-h-11 px-4"
                        >
                            Biaya & Isu
                            {openIssueCount > 0 && (
                                <span className="ml-1 px-1.5 text-[10px] bg-red-500 text-white rounded-full dark:bg-red-400">
                                    {openIssueCount}
                                </span>
                            )}
                        </TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="overview" className="mt-6">
                    <OrderOverviewTab order={order} formData={formData} />
                </TabsContent>

                <TabsContent value="execution" className="mt-6">
                    <OrderExecutionTab order={order} formData={formData} />
                </TabsContent>

                <TabsContent value="issues_costing" className="mt-6">
                    <div className="grid items-start gap-6 xl:grid-cols-5">
                        <div className="min-w-0 xl:col-span-3">
                            <OrderCostingTab
                                order={order}
                                costingData={costingData}
                                loadingCosting={loadingCosting}
                            />
                        </div>
                        <div className="min-w-0 xl:col-span-2">
                            <OrderIssuesTab order={order} />
                        </div>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
