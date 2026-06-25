"use client";

import {
  Machine,
  Location,
  ProductVariant,
  Employee,
  WorkShift,
} from "@prisma/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  updateProductionOrder,
  deleteProductionOrder,
} from "@/actions/production/production";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Package, Trash2, Factory } from "lucide-react";
import { getOrderCosting } from "@/actions/finance/finance";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import { ExtendedProductionOrder } from "@/components/production/order-detail/types";
import { OrderWorkflowStepper } from "@/components/production/order-detail/OrderWorkflowStepper";
import { AddOutputDialog } from "@/components/production/order-detail/AddOutputDialog";

import { OrderOverviewTab } from "./components/order-overview-tab";
import { OrderMaterialsTab } from "./components/order-materials-tab";
import { OrderExecutionTab } from "./components/order-execution-tab";
import { OrderIssuesTab } from "./components/order-issues-tab";
import { OrderCostingTab } from "./components/order-costing-tab";

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
  // Smart Default Tab Logic
  const getDefaultTab = (status: string) => {
    switch (status) {
      case "RELEASED":
        return "materials";
      case "IN_PROGRESS":
        return "execution";
      default:
        return "overview";
    }
  };

  const [activeTab, setActiveTab] = useState(getDefaultTab(order.status));
  const router = useRouter();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [costingData, setCostingData] = useState<any>(null);
  const [loadingCosting, setLoadingCosting] = useState(false);

  useEffect(() => {
    if (activeTab === "costing" && !costingData) {
      // eslint-disable-next-line
      setLoadingCosting(true);
      getOrderCosting(order.id)
        .then(setCostingData)
        .finally(() => setLoadingCosting(false));
    }
  }, [activeTab, order.id, costingData]);

  const handleDelete = async () => {
    toast.promise(deleteProductionOrder(order.id), {
      loading: "Deleting order...",
      success: (result) => {
        if (result.success) {
          router.push("/planning/orders");
          return "Order deleted successfully";
        } else {
          throw new Error(result.error);
        }
      },
      error: (err) => `Gagal menghapus: ${err.message}`,
    });
  };

  // Helper to determine badge color
  const getStatusColor = (status: string) => {
    switch (status) {
      case "DRAFT":
        return "bg-muted text-muted-foreground";
      case "RELEASED":
        return "bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400";
      case "IN_PROGRESS":
        return "bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400";
      case "COMPLETED":
        return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400";
      case "CANCELLED":
        return "bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400";
      case "WAITING_MATERIAL":
        return "bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold tracking-tight">
              Order {order.orderNumber}
            </h1>
            <Badge className={getStatusColor(order.status)}>
              {order.status}
            </Badge>
            {order.isMaklon && (
              <Badge
                variant="outline"
                className="border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800/50 dark:bg-blue-900/20 dark:text-blue-400"
              >
                <Factory className="w-3 h-3 mr-1" /> Maklon Service
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Package className="w-4 h-4" />{" "}
              {order.bom.productVariant.product.name} (
              {order.bom.productVariant.name})
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(order.status === "DRAFT" ||
            order.status === "WAITING_MATERIAL") && (
            <>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    size="icon"
                    title="Delete Order"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Apakah Anda yakin?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Tindakan ini tidak dapat dibatalkan. Ini akan menghapus
                      permanen order produksi beserta kebutuhan materialnya.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Batal</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      className="bg-destructive hover:bg-destructive/90"
                    >
                      Hapus
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button
                onClick={() =>
                  updateProductionOrder({ id: order.id, status: "RELEASED" })
                }
              >
                Release Order
              </Button>
            </>
          )}
          {order.status === "RELEASED" && (
            <div className="flex items-center gap-2">
              {order.materialIssues.length === 0 &&
                order.executions.length === 0 &&
                Number(order.actualQuantity || 0) === 0 && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        className="text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800/50 dark:hover:bg-red-900/20"
                      >
                        Batalkan Order
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Batalkan Work Order?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          Ini akan mengubah status order menjadi CANCELLED.
                          Karena belum ada material yang dikeluarkan dan belum
                          ada output yang dicatat, ini aman untuk menutup order
                          duplikat atau yang tidak diperlukan.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Kembali</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() =>
                            updateProductionOrder({
                              id: order.id,
                              status: "CANCELLED",
                            })
                          }
                          className="bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600"
                        >
                          Konfirmasi Pembatalan
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              <Button
                onClick={() =>
                  updateProductionOrder({ id: order.id, status: "IN_PROGRESS" })
                }
              >
                Start Production
              </Button>
            </div>
          )}
          {order.status === "IN_PROGRESS" && (
            <div className="flex items-center gap-2">
              {order.materialIssues.length === 0 &&
                order.executions.length === 0 &&
                Number(order.actualQuantity || 0) === 0 && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        className="text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800/50 dark:hover:bg-red-900/20"
                      >
                        Batalkan Order
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Batalkan Work Order?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          Ini akan mengubah status order menjadi CANCELLED.
                          Karena belum ada material yang dikeluarkan dan belum
                          ada output yang dicatat, ini aman untuk menutup order
                          duplikat atau yang tidak diperlukan.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Kembali</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() =>
                            updateProductionOrder({
                              id: order.id,
                              status: "CANCELLED",
                            })
                          }
                          className="bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600"
                        >
                          Konfirmasi Pembatalan
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              <AddOutputDialog order={order} formData={formData} />
              <Button
                variant="outline"
                onClick={() =>
                  updateProductionOrder({ id: order.id, status: "COMPLETED" })
                }
              >
                Finish Order
              </Button>
            </div>
          )}
          {order.status === "COMPLETED" && (
            <Button variant="outline" disabled>
              Completed
            </Button>
          )}
          {order.status === "CANCELLED" && (
            <Button
              variant="outline"
              disabled
              className="text-red-500 bg-red-50 dark:text-red-400 dark:bg-red-900/20"
            >
              Order Cancelled
            </Button>
          )}
        </div>
      </div>

      <OrderWorkflowStepper status={order.status} />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="overflow-x-auto pb-2 custom-scrollbar">
          <TabsList className="flex w-max min-w-full lg:grid lg:w-[550px] lg:grid-cols-5">
            <TabsTrigger value="overview" className="px-6 lg:px-2">
              Overview
            </TabsTrigger>

            <TabsTrigger value="materials" className="relative px-6 lg:px-2">
              Materials
              {order.status === "RELEASED" && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full animate-pulse dark:bg-blue-400" />
              )}
            </TabsTrigger>

            <TabsTrigger value="execution" className="relative px-6 lg:px-2">
              Execution
              {order.status === "IN_PROGRESS" && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-amber-500 rounded-full animate-pulse dark:bg-amber-400" />
              )}
            </TabsTrigger>

            <TabsTrigger value="issues" className="relative px-6 lg:px-2">
              Issues
              {order.issues?.some((i) => i.status === "OPEN") && (
                <span className="ml-1 px-1.5 text-[10px] bg-red-500 text-white rounded-full dark:bg-red-400">
                  {order.issues.filter((i) => i.status === "OPEN").length}
                </span>
              )}
            </TabsTrigger>

            <TabsTrigger value="costing" className="px-6 lg:px-2">
              Costing
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-6">
          <OrderOverviewTab order={order} formData={formData} />
        </TabsContent>

        <TabsContent value="materials" className="mt-6">
          <OrderMaterialsTab order={order} formData={formData} />
        </TabsContent>

        <TabsContent value="execution" className="mt-6">
          <OrderExecutionTab order={order} formData={formData} />
        </TabsContent>

        <TabsContent value="issues" className="mt-6">
          <OrderIssuesTab order={order} />
        </TabsContent>

        <TabsContent value="costing" className="mt-6">
          <OrderCostingTab
            order={order}
            costingData={costingData}
            loadingCosting={loadingCosting}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
