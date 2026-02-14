'use client';

import {
    Machine, Location, ProductVariant, Employee, WorkShift
} from '@prisma/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { updateProductionOrder, deleteProductionOrder } from '@/actions/production';
import { format } from 'date-fns';
import { useState } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Play, CheckCircle, Package, History, Trash2, Calculator, Info, TrendingUp as TrendingUpIcon, Factory } from 'lucide-react';
import { cn, formatRupiah } from '@/lib/utils';
import { getOrderCosting } from '@/actions/finance';
import { useEffect } from 'react';
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
import { Progress } from '@/components/ui/progress';

import { ShiftManager } from '@/components/production/ShiftManager';
import { ReassignMachineButton } from '@/components/production/ReassignMachineButton';

// Imported Components
import { ExtendedProductionOrder } from '@/components/production/order-detail/types';
import { OrderWorkflowStepper } from '@/components/production/order-detail/OrderWorkflowStepper';
import { AddOutputDialog } from '@/components/production/order-detail/AddOutputDialog';
import { BatchIssueMaterialDialog } from '@/components/production/order-detail/BatchIssueMaterialDialog';
import { RecordScrapDialog } from '@/components/production/order-detail/RecordScrapDialog';
import { DeleteScrapButton } from '@/components/production/order-detail/DeleteScrapButton';
import { RecordQCDialog } from '@/components/production/order-detail/RecordQCDialog';
import { ManualProcurementDialog } from '@/components/production/order-detail/ManualProcurementDialog';
import { ChildOrderList } from '@/components/production/order-detail/ChildOrderList';
import { AddIssueDialog } from '@/components/production/order-detail/AddIssueDialog';
import { updateProductionIssueStatus } from '@/actions/production';
import { AlertTriangle } from 'lucide-react';


import { VoidExecutionButton } from '@/components/production/VoidExecutionButton';

interface PageProps {
    order: ExtendedProductionOrder;
    formData: {
        locations: Location[];
        operators: Employee[];
        helpers: Employee[];
        workShifts: WorkShift[];
        machines: Machine[];
        rawMaterials: ProductVariant[];
    }
}


export function ProductionOrderDetail({ order, formData }: PageProps) {

    // Smart Default Tab Logic
    const getDefaultTab = (status: string) => {
        switch (status) {
            case 'RELEASED': return 'materials';
            case 'IN_PROGRESS': return 'execution';
            default: return 'overview';
        }
    };

    const [activeTab, setActiveTab] = useState(getDefaultTab(order.status));
    const router = useRouter();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [costingData, setCostingData] = useState<any>(null);
    const [loadingCosting, setLoadingCosting] = useState(false);

    useEffect(() => {
        if (activeTab === 'costing' && !costingData) {
            // eslint-disable-next-line
            setLoadingCosting(true);
            getOrderCosting(order.id)
                .then(setCostingData)
                .finally(() => setLoadingCosting(false));
        }
    }, [activeTab, order.id, costingData]);

    const plannedQty = Number(order.plannedQuantity);
    const actualQty = Number(order.actualQuantity || 0);
    const progress = Math.min((actualQty / plannedQty) * 100, 100);

    const handleDelete = async () => {
        toast.promise(deleteProductionOrder(order.id), {
            loading: 'Deleting order...',
            success: (result) => {
                if (result.success) {
                    router.push('/planning/orders');
                    return 'Order deleted successfully';
                } else {
                    throw new Error(result.error);
                }
            },
            error: (err) => `Failed to delete: ${err.message}`
        });
    };

    // Helper to determine badge color
    const getStatusColor = (status: string) => {
        switch (status) {
            case 'DRAFT': return 'bg-muted text-muted-foreground';
            case 'RELEASED': return 'bg-blue-100 text-blue-700';
            case 'IN_PROGRESS': return 'bg-amber-100 text-amber-700';
            case 'COMPLETED': return 'bg-emerald-100 text-emerald-700';
            case 'CANCELLED': return 'bg-red-100 text-red-700';
            case 'WAITING_MATERIAL': return 'bg-orange-100 text-orange-700';
            default: return 'bg-muted text-muted-foreground';
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <h1 className="text-2xl font-bold tracking-tight">Order {order.orderNumber}</h1>
                        <Badge className={getStatusColor(order.status)}>{order.status}</Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1"><Package className="w-4 h-4" /> {order.bom.productVariant.product.name} ({order.bom.productVariant.name})</span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {(order.status === 'DRAFT' || order.status === 'WAITING_MATERIAL') && (
                        <>
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="destructive" size="icon" title="Delete Order">
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            This action cannot be undone. This will permanently delete the production order and its material requirements.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                            <Button onClick={() => updateProductionOrder({ id: order.id, status: 'RELEASED' })}>
                                Release Order
                            </Button>
                        </>
                    )}
                    {order.status === 'RELEASED' && (
                        <div className="flex items-center gap-2">
                            {/* Cancellation Guard: No material issues AND no executions */}
                            {order.materialIssues.length === 0 && order.executions.length === 0 && actualQty === 0 && (
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50">
                                            Cancel Order
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Cancel Work Order?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                This will move the order to CANCELLED status. Since no materials have been issued and no output recorded, this is a safe way to close a duplicate or unwanted order.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Go Back</AlertDialogCancel>
                                            <AlertDialogAction
                                                onClick={() => updateProductionOrder({ id: order.id, status: 'CANCELLED' })}
                                                className="bg-red-600 hover:bg-red-700"
                                            >
                                                Confirm Cancellation
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            )}
                            <Button onClick={() => updateProductionOrder({ id: order.id, status: 'IN_PROGRESS' })}>
                                <Play className="w-4 h-4 mr-2" /> Start Production
                            </Button>
                        </div>
                    )}
                    {order.status === 'IN_PROGRESS' && (
                        <div className="flex items-center gap-2">
                            {/* Cancellation Guard: No material issues AND no executions */}
                            {order.materialIssues.length === 0 && order.executions.length === 0 && actualQty === 0 && (
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50">
                                            Cancel Order
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Cancel Work Order?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                This will move the order to CANCELLED status. Since no materials have been issued and no output recorded, this is a safe way to close a duplicate or unwanted order.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Go Back</AlertDialogCancel>
                                            <AlertDialogAction
                                                onClick={() => updateProductionOrder({ id: order.id, status: 'CANCELLED' })}
                                                className="bg-red-600 hover:bg-red-700"
                                            >
                                                Confirm Cancellation
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            )}
                            <AddOutputDialog order={order} formData={formData} />
                            <Button variant="outline" onClick={() => updateProductionOrder({ id: order.id, status: 'COMPLETED' })}>
                                <CheckCircle className="w-4 h-4 mr-2" /> Finish Order
                            </Button>
                        </div>
                    )}
                    {order.status === 'COMPLETED' && (
                        <Button variant="outline" disabled>
                            <CheckCircle className="w-4 h-4 mr-2" /> Completed
                        </Button>
                    )}
                    {order.status === 'CANCELLED' && (
                        <Button variant="outline" disabled className="text-red-500 bg-red-50">
                            Order Cancelled
                        </Button>
                    )}
                </div>
            </div>



            <OrderWorkflowStepper status={order.status} />

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <div className="overflow-x-auto pb-2 custom-scrollbar">
                    <TabsList className="flex w-max min-w-full lg:grid lg:w-[550px] lg:grid-cols-5">
                        <TabsTrigger value="overview" className="px-6 lg:px-2">Overview</TabsTrigger>

                        <TabsTrigger value="materials" className="relative px-6 lg:px-2">
                            Materials
                            {order.status === 'RELEASED' && <span className="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full animate-pulse" />}
                        </TabsTrigger>

                        <TabsTrigger value="execution" className="relative px-6 lg:px-2">
                            Execution
                            {order.status === 'IN_PROGRESS' && <span className="absolute top-1 right-1 w-2 h-2 bg-amber-500 rounded-full animate-pulse" />}
                        </TabsTrigger>

                        <TabsTrigger value="issues" className="relative px-6 lg:px-2">
                            Issues
                            {order.issues?.some(i => i.status === 'OPEN') && (
                                <span className="ml-1 px-1.5 text-[10px] bg-red-500 text-white rounded-full">
                                    {order.issues.filter(i => i.status === 'OPEN').length}
                                </span>
                            )}
                        </TabsTrigger>

                        <TabsTrigger value="costing" className="px-6 lg:px-2">
                            Costing
                        </TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="overview" className="space-y-6 mt-6">
                    {/* Progress Section */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Production Progress</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-2xl font-bold">{actualQty.toFixed(2)} / {plannedQty.toFixed(2)} <span className="text-sm font-normal text-muted-foreground">{order.bom.productVariant.primaryUnit}</span></span>
                                <span className="text-sm font-medium text-muted-foreground">{progress.toFixed(1)}%</span>
                            </div>
                            <Progress value={progress} className="h-2" />
                        </CardContent>
                    </Card>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Left Column: Order Details & Resources */}
                        <Card className="lg:col-span-1 h-fit">
                            <CardHeader><CardTitle className="text-base">Order Information</CardTitle></CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-4">
                                    <DetailRow label="BOM Recipe" value={order.bom.name} />
                                    <DetailRow label="Planned Start" value={format(new Date(order.plannedStartDate), 'PPP')} />
                                    <DetailRow label="Planned End" value={order.plannedEndDate ? format(new Date(order.plannedEndDate), 'PPP') : '-'} />
                                    <DetailRow label="Output Location" value={order.location.name} />
                                </div>

                                <div className="border-t pt-4 mt-4">
                                    <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                                        <Factory className="w-3 h-3" /> Assigned Resources
                                    </h4>
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center border-b pb-2 last:border-0 last:pb-0">
                                            <span className="text-muted-foreground text-sm">Machine</span>
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium text-sm">{order.machine?.name || 'Unassigned'}</span>
                                                <ReassignMachineButton
                                                    orderId={order.id}
                                                    orderNumber={order.orderNumber}
                                                    currentMachineId={order.machine?.id || null}
                                                    machines={formData.machines}
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-sm text-muted-foreground mb-1">Workforce</p>
                                            <p className="text-sm font-medium">
                                                {order.shifts?.length || 0} Shifts Assigned
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Right Column: Production History */}
                        <Card className="lg:col-span-2 h-full">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <History className="w-4 h-4" /> Production History
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                {order.executions && order.executions.length > 0 ? (
                                    <div className="rounded-md border overflow-x-auto custom-scrollbar">
                                        <table className="w-full text-sm text-left min-w-[500px]">
                                            <thead className="bg-muted/50 text-muted-foreground font-medium">
                                                <tr>
                                                    <th className="p-3">Date/Time</th>
                                                    <th className="p-3">Shift</th>
                                                    <th className="p-3">Operator</th>
                                                    <th className="p-3 text-right">Output</th>
                                                    <th className="p-3 text-right">Scrap</th>
                                                    <th className="p-3 text-right">Action</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y">
                                                {order.executions.map((exec) => (
                                                    <tr key={exec.id} className={cn(exec.status === 'VOIDED' && "opacity-50 line-through bg-muted/30")}>
                                                        <td className="p-3">
                                                            <div className="flex flex-col">
                                                                <span>{format(new Date(exec.startTime), 'MMM d, yyyy')}</span>
                                                                <span className="text-xs text-muted-foreground">
                                                                    {format(new Date(exec.startTime), 'HH:mm')} - {exec.endTime ? format(new Date(exec.endTime), 'HH:mm') : 'ongoing'}
                                                                </span>
                                                                {exec.status === 'VOIDED' && <span className="text-[10px] font-bold text-destructive uppercase tracking-tighter">Voided</span>}
                                                            </div>
                                                        </td>
                                                        <td className="p-3">{exec.shift?.name || '-'}</td>
                                                        <td className="p-3">{exec.operator?.name || '-'}</td>
                                                        <td className="p-3 text-right font-medium text-emerald-600">
                                                            {exec.status === 'VOIDED' ? '-' : `+${Number(exec.quantityProduced)}`}
                                                        </td>
                                                        <td className="p-3 text-right text-destructive">
                                                            {exec.status === 'VOIDED' ? '-' : (() => {
                                                                const totalScrap = Number(exec.scrapQuantity || 0) +
                                                                    Number(exec.scrapDaunQty || 0) +
                                                                    Number(exec.scrapProngkolQty || 0);
                                                                return totalScrap > 0 ? totalScrap : '-';
                                                            })()}
                                                        </td>
                                                        <td className="p-3 text-right">
                                                            {exec.status !== 'VOIDED' && (
                                                                <VoidExecutionButton
                                                                    executionId={exec.id}
                                                                    productionOrderId={order.id}
                                                                    orderNumber={order.orderNumber}
                                                                />
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <div className="text-center py-20 text-muted-foreground flex flex-col items-center justify-center">
                                        <History className="w-10 h-10 mb-4 opacity-10" />
                                        <p>No production output recorded yet.</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="materials" className="space-y-6 mt-6">
                    {/* Sub-Orders Handling */}
                    <ChildOrderList order={order} />

                    <div className="flex justify-between items-center">
                        <h3 className="text-lg font-semibold">Material Requirements</h3>
                        <div className="flex items-center gap-2">
                            <ManualProcurementDialog order={order} />
                            {(order.status === 'IN_PROGRESS' || order.status === 'RELEASED') && (
                                <BatchIssueMaterialDialog
                                    order={order}
                                    locations={formData.locations}
                                    rawMaterials={formData.rawMaterials || []}
                                />
                            )}
                        </div>
                    </div>

                    <Card>
                        <CardContent className="p-0">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-muted/50 text-muted-foreground">
                                    <tr>
                                        <th className="p-3 pl-4">Material</th>
                                        <th className="p-3 text-right">Plan</th>
                                        <th className="p-3 text-right w-[25%]">Issued</th>
                                        <th className="p-3 text-right">Variance</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {(order.plannedMaterials || []).map((item) => {
                                        const manualIssued = (order.materialIssues || [])
                                            .filter((mi) => mi.productVariantId === item.productVariantId)
                                            .reduce((sum: number, mi) => sum + Number(mi.quantity), 0);

                                        const isBackflushCategory = ['MIXING', 'EXTRUSION', 'PACKING'].includes(order.bom?.category || '');
                                        const actualQty = order.actualQuantity ? Number(order.actualQuantity) : 0;

                                        const hasExplicitIssues = (order.materialIssues || []).length > 0;
                                        let backflushedQty = 0;
                                        // B. Backflushed Quantities (only if no explicit issues exist - fallback for legacy)
                                        if (!hasExplicitIssues && isBackflushCategory && actualQty > 0 && plannedQty > 0) {
                                            backflushedQty = (actualQty / plannedQty) * Number(item.quantity);
                                        }
                                        const issued = manualIssued + backflushedQty;
                                        const required = Number(item.quantity);
                                        const variance = issued - required;
                                        const variancePercent = required > 0 ? (variance / required) * 100 : 0;
                                        const isOver = variance > 0;
                                        const isUnder = variance < 0;

                                        // Progress Bar Color Logic
                                        let progressColor = "bg-emerald-500";
                                        if (variancePercent > 5) progressColor = "bg-red-500";
                                        else if (variancePercent < -5) progressColor = "bg-amber-500";

                                        // Progress Width (capped at 100%)
                                        const progressValue = Math.min(100, (issued / (required || 1)) * 100);

                                        return (
                                            <tr key={item.id} className="hover:bg-muted/50">
                                                <td className="p-3 pl-4">
                                                    <div className="flex flex-col">
                                                        <span className="font-medium text-foreground">{item.productVariant.name}</span>
                                                        <span className="text-[10px] text-blue-600 font-bold uppercase tracking-wider">Planned</span>
                                                        <span className="text-xs text-muted-foreground">{item.productVariant.skuCode}</span>
                                                    </div>
                                                </td>
                                                <td className="p-3 text-right font-medium text-muted-foreground">{required.toFixed(2)} {item.productVariant.primaryUnit}</td>
                                                <td className="p-3 text-right">
                                                    <div className="flex flex-col gap-1 w-full">
                                                        <span className={cn(
                                                            "font-bold",
                                                            isOver ? "text-red-600" : isUnder ? "text-amber-600" : "text-emerald-600"
                                                        )}>
                                                            {issued.toFixed(2)} {item.productVariant.primaryUnit}
                                                        </span>
                                                        <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                                                            <div
                                                                className={cn("h-full rounded-full", progressColor)}
                                                                style={{ width: `${progressValue}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-3 text-right">
                                                    <div className="flex flex-col items-end gap-1">
                                                        <Badge variant="outline" className={cn(
                                                            "font-mono",
                                                            isOver ? "text-red-600 border-red-200 bg-red-50" :
                                                                Math.abs(variancePercent) < 0.01 ? "text-emerald-600 border-emerald-200 bg-emerald-50" :
                                                                    "text-amber-600 border-amber-200 bg-amber-50"
                                                        )}>
                                                            {variance > 0 ? '+' : ''}{variance.toFixed(2)}
                                                        </Badge>
                                                        <span className="text-[10px] text-muted-foreground">
                                                            {variance > 0 ? '+' : ''}{variancePercent.toFixed(1)}%
                                                        </span>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}

                                    {/* Handle Substitute Materials */}
                                    {(order.materialIssues || [])
                                        .filter((mi) => !(order.plannedMaterials || []).some((pm) => pm.productVariantId === mi.productVariantId))
                                        .reduce((acc: { productVariantId: string; productVariant: { name: string; skuCode?: string; primaryUnit: string }; quantity: number }[], mi) => {
                                            const existing = acc.find(a => a.productVariantId === mi.productVariantId);
                                            if (existing) {
                                                existing.quantity += Number(mi.quantity);
                                            } else {
                                                acc.push({
                                                    productVariantId: mi.productVariantId,
                                                    productVariant: {
                                                        name: mi.productVariant.name,
                                                        skuCode: mi.productVariant.skuCode,
                                                        primaryUnit: mi.productVariant.primaryUnit
                                                    },
                                                    quantity: Number(mi.quantity)
                                                });
                                            }
                                            return acc;
                                        }, [])
                                        .map((sub) => (
                                            <tr key={sub.productVariantId} className="bg-amber-500/10 hover:bg-amber-500/20">
                                                <td className="p-3 pl-4">
                                                    <div className="flex flex-col">
                                                        <span className="font-medium text-foreground">{sub.productVariant.name}</span>
                                                        <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">Unplanned Issue</span>
                                                    </div>
                                                </td>
                                                <td className="p-3 text-right text-muted-foreground">-</td>
                                                <td className="p-3 text-right">
                                                    <span className="font-bold text-amber-600">
                                                        {Number(sub.quantity).toFixed(2)} {sub.productVariant.primaryUnit}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-right">
                                                    <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">
                                                        Substitute
                                                    </Badge>
                                                </td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                        </CardContent>
                    </Card>

                    <div className="mt-6">
                        <h3 className="text-lg font-semibold mb-3">Issue History</h3>
                        {order.materialIssues.length === 0 ? (
                            <p className="text-muted-foreground italic">No materials issued yet.</p>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {order.materialIssues.map((issue) => (
                                    <div key={issue.id} className={cn(
                                        "flex justify-between items-center p-3 bg-card rounded-lg border shadow-sm hover:border-border transition-colors",
                                        issue.status === 'VOIDED' && "opacity-50 line-through bg-muted/30"
                                    )}>
                                        <div className="flex flex-col">
                                            <span className="font-medium text-foreground">{issue.productVariant.name}</span>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[11px] text-muted-foreground">
                                                    {format(new Date(issue.issuedAt), 'PP p')}
                                                </span>
                                                {issue.status === 'VOIDED' && (
                                                    <span className="text-[10px] font-bold text-destructive uppercase tracking-tighter">Voided</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="font-mono bg-muted px-2 py-1 rounded text-xs font-semibold">
                                                {Number(issue.quantity)} {issue.productVariant.primaryUnit}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </TabsContent>

                <TabsContent value="execution" className="space-y-6 mt-6">
                    {/* Shift Management Section */}
                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <h3 className="text-lg font-semibold flex items-center gap-2">
                                <Play className="w-4 h-4 text-blue-500" /> Operational Resources
                            </h3>
                        </div>
                        <ShiftManager
                            orderId={order.id}
                            shifts={order.shifts || []}
                            operators={formData.operators}
                            helpers={formData.helpers}
                            readOnly={order.status === 'COMPLETED' || order.status === 'CANCELLED'}
                            workShifts={formData.workShifts}
                            machines={formData.machines}
                        />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Logs and Quality Section */}
                        <div className="space-y-6">
                            <div className="flex justify-between items-center">
                                <h3 className="text-lg font-semibold flex items-center gap-2">
                                    <TrendingUpIcon className="w-4 h-4 text-amber-500" /> Production & Scrap
                                </h3>
                                {order.status === 'IN_PROGRESS' && (
                                    <RecordScrapDialog order={order} locations={formData.locations} />
                                )}
                            </div>

                            <Card>
                                <CardHeader><CardTitle className="text-sm font-medium">Scrap Records</CardTitle></CardHeader>
                                <CardContent>
                                    {order.scrapRecords.length === 0 ? <p className="text-muted-foreground text-sm italic py-4">No scrap recorded for this order.</p> : (
                                        <ul className="space-y-2">
                                            {order.scrapRecords.map((scrap) => (
                                                <li key={scrap.id} className="flex justify-between items-center text-sm border-b pb-2 last:border-0">
                                                    <div>
                                                        <p className="font-medium">{scrap.productVariant.name}</p>
                                                        <p className="text-xs text-muted-foreground">{scrap.reason || 'No reason provided'}</p>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50">
                                                            {Number(scrap.quantity)} {scrap.productVariant.primaryUnit}
                                                        </Badge>
                                                        {order.status === 'IN_PROGRESS' && (
                                                            <DeleteScrapButton
                                                                scrapId={scrap.id}
                                                                orderId={order.id}
                                                                productName={scrap.productVariant.name}
                                                            />
                                                        )}
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </CardContent>
                            </Card>
                        </div>

                        <div className="space-y-6">
                            <div className="flex justify-between items-center">
                                <h3 className="text-lg font-semibold flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4 text-emerald-500" /> Quality Control
                                </h3>
                                {(order.status === 'IN_PROGRESS' || order.status === 'COMPLETED') && (
                                    <RecordQCDialog order={order} />
                                )}
                            </div>

                            <Card>
                                <CardHeader><CardTitle className="text-sm font-medium">Inspection History</CardTitle></CardHeader>
                                <CardContent className="space-y-3">
                                    {order.inspections.map((insp) => (
                                        <div key={insp.id} className="p-3 border rounded-lg flex items-start justify-between bg-zinc-50/50">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <Badge className={cn(
                                                        insp.result === 'PASS' ? "bg-emerald-100 text-emerald-700" :
                                                            insp.result === 'FAIL' ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                                                    )}>
                                                        {insp.result}
                                                    </Badge>
                                                    <span className="text-[10px] text-muted-foreground">{format(new Date(insp.inspectedAt), 'MMM d, HH:mm')}</span>
                                                </div>
                                                <p className="text-xs text-foreground line-clamp-2">{insp.notes || "No notes."}</p>
                                            </div>
                                            <div className="text-[10px] text-muted-foreground whitespace-nowrap ml-2">
                                                {insp.inspector?.name?.split(' ')[0] || 'System'}
                                            </div>
                                        </div>
                                    ))}
                                    {order.inspections.length === 0 && <p className="text-muted-foreground text-sm italic py-4">No inspections recorded.</p>}
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </TabsContent>
                <TabsContent value="issues" className="space-y-6 mt-6">
                    <div className="flex justify-between items-center">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                            Production Issues
                        </h3>
                        {(order.status === 'IN_PROGRESS' || order.status === 'RELEASED') && (
                            <AddIssueDialog orderId={order.id} />
                        )}
                    </div>

                    {(!order.issues || order.issues.length === 0) ? (
                        <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-xl">
                            <AlertTriangle className="w-12 h-12 mx-auto mb-4 opacity-20" />
                            <p>No issues recorded for this order.</p>
                            <p className="text-xs mt-1">Issues help track and resolve production problems.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {order.issues.map((issue) => (
                                <Card key={issue.id} className={cn(
                                    "transition-colors",
                                    issue.status === 'RESOLVED' ? "opacity-60" : ""
                                )}>
                                    <CardContent className="p-4">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1 space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <Badge variant="outline" className={cn(
                                                        "text-xs",
                                                        issue.status === 'OPEN' ? "bg-red-50 text-red-700 border-red-200" :
                                                            issue.status === 'IN_PROGRESS' ? "bg-amber-50 text-amber-700 border-amber-200" :
                                                                "bg-emerald-50 text-emerald-700 border-emerald-200"
                                                    )}>
                                                        {issue.status}
                                                    </Badge>
                                                    <Badge variant="secondary" className="text-xs">
                                                        {issue.category.replace('_', ' ')}
                                                    </Badge>
                                                </div>
                                                <p className="text-sm text-foreground">{issue.description}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    Reported: {format(new Date(issue.reportedAt), 'MMM d, yyyy HH:mm')}
                                                    {issue.reportedBy?.name && ` by ${issue.reportedBy.name}`}
                                                </p>
                                                {issue.resolvedAt && (
                                                    <p className="text-xs text-emerald-600">
                                                        Resolved: {format(new Date(issue.resolvedAt), 'MMM d, yyyy HH:mm')}
                                                        {issue.resolvedNotes && ` - ${issue.resolvedNotes}`}
                                                    </p>
                                                )}
                                            </div>
                                            {issue.status !== 'RESOLVED' && order.status === 'IN_PROGRESS' && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                                                    onClick={async () => {
                                                        const result = await updateProductionIssueStatus(
                                                            issue.id,
                                                            'RESOLVED',
                                                            undefined,
                                                            order.id
                                                        );
                                                        if (result.success) {
                                                            toast.success('Issue resolved');
                                                        } else {
                                                            toast.error('Failed to resolve issue');
                                                        }
                                                    }}
                                                >
                                                    Resolve
                                                </Button>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="costing" className="space-y-6 mt-6">
                    {loadingCosting ? (
                        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                            <Calculator className="w-8 h-8 animate-pulse mb-2" />
                            <p>Calculating batch costs...</p>
                        </div>
                    ) : costingData ? (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <Card className="md:col-span-2">
                                <CardHeader>
                                    <CardTitle className="text-base flex items-center gap-2">
                                        <Calculator className="w-4 h-4" /> Cost Breakdown
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Material Cost</p>
                                            <p className="text-xl font-bold">{formatRupiah(costingData.materialCost)}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Conversion Cost</p>
                                            <p className="text-xl font-bold">{formatRupiah(costingData.conversionCost)}</p>
                                        </div>
                                    </div>
                                    <div className="pt-4 border-t">
                                        <div className="flex justify-between items-end">
                                            <div>
                                                <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Total COGM</p>
                                                <p className="text-2xl font-black text-blue-600">{formatRupiah(costingData.totalCost)}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Unit Cost</p>
                                                <p className="text-xl font-bold text-emerald-600">{formatRupiah(costingData.unitCost)} <span className="text-xs font-normal text-muted-foreground">/ {order.bom.productVariant.primaryUnit}</span></p>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base flex items-center gap-2">
                                        <Info className="w-4 h-4" /> Insights
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-muted-foreground">Material %</span>
                                            <span className="font-medium">{((costingData.materialCost / costingData.totalCost) * 100).toFixed(1)}%</span>
                                        </div>
                                        <Progress value={(costingData.materialCost / costingData.totalCost) * 100} className="h-1.5" />
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-muted-foreground">Conversion %</span>
                                            <span className="font-medium">{((costingData.conversionCost / costingData.totalCost) * 100).toFixed(1)}%</span>
                                        </div>
                                        <Progress value={(costingData.conversionCost / costingData.totalCost) * 100} className="h-1.5 bg-amber-100" />
                                    </div>
                                    <div className="mt-4 p-3 bg-zinc-50 rounded-lg border text-xs text-muted-foreground">
                                        <p className="flex items-center gap-1 font-medium text-zinc-900 mb-1">
                                            <TrendingUpIcon className="w-3 h-3 text-blue-500" /> WAC-based Valuation
                                        </p>
                                        Material costs are calculated using the Weighted Average Cost at the time of issuance.
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    ) : (
                        <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-xl">
                            <Calculator className="w-12 h-12 mx-auto mb-4 opacity-20" />
                            <p>No costing data available for this order yet.</p>
                            <p className="text-xs mt-1">Costs are aggregated once materials are issued or output is recorded.</p>
                        </div>
                    )}
                </TabsContent>
            </Tabs>
        </div >
    );
}

// --- Sub Components ---

function DetailRow({ label, value }: { label: string, value: string }) {
    return (
        <div className="flex justify-between border-b pb-2 last:border-0 last:pb-0">
            <span className="text-muted-foreground text-sm">{label}</span>
            <span className="font-medium text-sm">{value}</span>
        </div>
    );
}



