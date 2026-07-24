"use client";

import {
  Machine,
  Location,
  ProductVariant,
  Employee,
  WorkShift,
} from "@prisma/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState, useEffect } from "react";
import { getOrderCosting } from "@/actions/finance/finance";

import { ExtendedProductionOrder } from "@/components/production/order-detail/types";
import { OrderWorkflowStepper } from "@/components/production/order-detail/OrderWorkflowStepper";

import { OrderOverviewTab } from "./components/order-overview-tab";
import { OrderExecutionTab } from "./components/order-execution-tab";
import { OrderIssuesTab } from "./components/order-issues-tab";
import { OrderCostingTab } from "./components/order-costing-tab";
import { OrderDetailHeader } from "./components/order-detail-header";

interface PageProps {
  order: ExtendedProductionOrder;
  formData: {
    locations: Location[];
    operators: Employee[];
    helpers: Employee[];
    workShifts: WorkShift[];
    machines: Machine[];
    rawMaterials: ProductVariant[];
  };
}

export function ProductionOrderDetail({ order, formData }: PageProps) {
  const getDefaultTab = (status: string) => {
    switch (status) {
      case "WAITING_MATERIAL":
        return "overview";
      case "RELEASED":
        return "overview";
      case "IN_PROGRESS":
        return "execution";
      default:
        return "overview";
    }
  };

  const [activeTab, setActiveTab] = useState(getDefaultTab(order.status));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [costingData, setCostingData] = useState<any>(null);
  const [loadingCosting, setLoadingCosting] = useState(false);

  useEffect(() => {
    if (activeTab === "issues_costing" && !costingData) {
      setLoadingCosting(true);
      getOrderCosting(order.id)
        .then(setCostingData)
        .finally(() => setLoadingCosting(false));
    }
  }, [activeTab, order.id, costingData]);

  const openIssueCount =
    order.issues?.filter((i) => i.status === "OPEN").length || 0;

  return (
    <div className="space-y-6">
      <OrderDetailHeader order={order} formData={formData} />

      <OrderWorkflowStepper status={order.status} />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="overflow-x-auto pb-2 custom-scrollbar">
          <TabsList className="flex w-max min-w-full lg:grid lg:w-[500px] lg:grid-cols-3">
            <TabsTrigger value="overview" className="px-6 lg:px-4">
              Operasional
            </TabsTrigger>

            <TabsTrigger value="execution" className="relative px-6 lg:px-4">
              Sumber Daya
              {order.status === "IN_PROGRESS" && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-amber-500 rounded-full animate-pulse dark:bg-amber-400" />
              )}
            </TabsTrigger>

            <TabsTrigger value="issues_costing" className="relative px-6 lg:px-4">
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
          <div className="space-y-6">
            <OrderIssuesTab order={order} />
            <OrderCostingTab
              order={order}
              costingData={costingData}
              loadingCosting={loadingCosting}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
