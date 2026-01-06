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
import {
    Play, CheckCircle, Package, History, Trash2
} from 'lucide-react';
import { cn } from '@/lib/utils';
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

// Imported Components
import { ExtendedProductionOrder } from '@/components/production/order-detail/types';
import { OrderWorkflowStepper } from '@/components/production/order-detail/OrderWorkflowStepper';
import { AddOutputDialog } from '@/components/production/order-detail/AddOutputDialog';
import { BatchIssueMaterialDialog } from '@/components/production/order-detail/BatchIssueMaterialDialog';
import { DeleteIssueButton } from '@/components/production/order-detail/DeleteIssueButton';
import { RecordScrapDialog } from '@/components/production/order-detail/RecordScrapDialog';
import { RecordQCDialog } from '@/components/production/order-detail/RecordQCDialog';

interface PageProps {
    order: any; // Type assertion needed due to serialization
    formData: {
        locations: Location[];
        operators: Employee[];
        helpers: Employee[];
        workShifts: WorkShift[];
        machines: Machine[];
        rawMaterials: ProductVariant[];
    }
}


export function ProductionOrderDetail({ order: initialOrder, formData }: PageProps) {
    const order = initialOrder as ExtendedProductionOrder;

    // Smart Default Tab Logic
    const getDefaultTab = (status: string) => {
        switch (status) {
            case 'RELEASED': return 'materials';
            case 'IN_PROGRESS': return 'operations';
            default: return 'overview';
        }
    };

    const [activeTab, setActiveTab] = useState(getDefaultTab(order.status));
    const router = useRouter();

    const plannedQty = Number(order.plannedQuantity);
    const actualQty = Number(order.actualQuantity || 0);
    const progress = Math.min((actualQty / plannedQty) * 100, 100);

    const handleDelete = async () => {
        toast.promise(deleteProductionOrder(order.id), {
            loading: 'Deleting order...',
            success: (result) => {
                if (result.success) {
                    router.push('/dashboard/production/orders');
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
            case 'DRAFT': return 'bg-slate-100 text-slate-700';
            case 'RELEASED': return 'bg-blue-100 text-blue-700';
            case 'IN_PROGRESS': return 'bg-amber-100 text-amber-700';
            case 'COMPLETED': return 'bg-emerald-100 text-emerald-700';
            case 'CANCELLED': return 'bg-red-100 text-red-700';
            default: return 'bg-slate-100 text-slate-700';
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
                    <div className="flex items-center gap-4 text-sm text-slate-500">
                        <span className="flex items-center gap-1"><Package className="w-4 h-4" /> {order.bom.productVariant.product.name} ({order.bom.productVariant.name})</span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {order.status === 'DRAFT' && (
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
                                            This action cannot be undone. This will permanently delete the draft production order and its material requirements.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                            <Button onClick={() => updateProductionOrder({ id: order.id, status: 'RELEASED' })}>
                                Release Order
                            </Button>
                        </>
                    )}
                    {order.status === 'RELEASED' && (
                        <Button onClick={() => updateProductionOrder({ id: order.id, status: 'IN_PROGRESS' })}>
                            <Play className="w-4 h-4 mr-2" /> Start Production
                        </Button>
                    )}
                    {order.status === 'IN_PROGRESS' && (
                        <>
                            <AddOutputDialog order={order} formData={formData} />
                            <Button variant="outline" onClick={() => updateProductionOrder({ id: order.id, status: 'COMPLETED' })}>
                                <CheckCircle className="w-4 h-4 mr-2" /> Finish Order
                            </Button>
                        </>
                    )}
                    {order.status === 'COMPLETED' && (
                        <Button variant="outline" disabled>
                            <CheckCircle className="w-4 h-4 mr-2" /> Completed
                        </Button>
                    )}
                </div>
            </div>



            <OrderWorkflowStepper status={order.status} />

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-5 lg:w-[500px]">
                    <TabsTrigger value="overview">Overview</TabsTrigger>

                    <TabsTrigger value="shifts" className="relative">
                        Shifts
                        {order.status === 'RELEASED' && <span className="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full animate-pulse" />}
                    </TabsTrigger>

                    <TabsTrigger value="materials" className="relative">
                        Materials
                        {order.status === 'RELEASED' && <span className="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full animate-pulse" />}
                    </TabsTrigger>

                    <TabsTrigger value="operations" className="relative">
                        Operations
                        {order.status === 'IN_PROGRESS' && <span className="absolute top-1 right-1 w-2 h-2 bg-amber-500 rounded-full animate-pulse" />}
                    </TabsTrigger>

                    <TabsTrigger value="qc" className="relative">
                        QC
                        {order.status === 'IN_PROGRESS' && <span className="absolute top-1 right-1 w-2 h-2 bg-amber-500 rounded-full" />}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-6 mt-6">
                    {/* Progress Section */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-slate-500">Production Progress</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-2xl font-bold">{actualQty.toFixed(2)} / {plannedQty.toFixed(2)} <span className="text-sm font-normal text-slate-500">{order.bom.productVariant.primaryUnit}</span></span>
                                <span className="text-sm font-medium text-slate-600">{progress.toFixed(1)}%</span>
                            </div>
                            <Progress value={progress} className="h-2" />
                        </CardContent>
                    </Card>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Card>
                            <CardHeader><CardTitle className="text-base">Order Details</CardTitle></CardHeader>
                            <CardContent className="space-y-4">
                                <DetailRow label="BOM Recipe" value={order.bom.name} />
                                <DetailRow label="Planned Start" value={format(new Date(order.plannedStartDate), 'PPP')} />
                                <DetailRow label="Planned End" value={order.plannedEndDate ? format(new Date(order.plannedEndDate), 'PPP') : '-'} />
                                <DetailRow label="Output Location" value={order.location.name} />
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader><CardTitle className="text-base">Resource Assignment</CardTitle></CardHeader>
                            <CardContent className="space-y-4">
                                <DetailRow label="Machine" value={order.machine?.name || 'Unassigned'} />
                                <div className="border-t pt-2 mt-2">
                                    <p className="text-sm text-slate-500 mb-1">Workforce</p>
                                    <p className="text-sm font-medium">
                                        {order.shifts?.length || 0} Shifts Assigned
                                    </p>

                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Production History Table */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <History className="w-4 h-4" /> Production History
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {order.executions && order.executions.length > 0 ? (
                                <div className="rounded-md border">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-slate-50 text-slate-500 font-medium">
                                            <tr>
                                                <th className="p-3">Date/Time</th>
                                                <th className="p-3">Shift</th>
                                                <th className="p-3">Operator</th>
                                                <th className="p-3 text-right">Output</th>
                                                <th className="p-3 text-right">Scrap</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {order.executions.map((exec) => (
                                                <tr key={exec.id}>
                                                    <td className="p-3">
                                                        <div className="flex flex-col">
                                                            <span>{format(new Date(exec.startTime), 'MMM d, yyyy')}</span>
                                                            <span className="text-xs text-slate-500">
                                                                {format(new Date(exec.startTime), 'HH:mm')} - {format(new Date(exec.endTime), 'HH:mm')}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="p-3">{exec.shift?.name || '-'}</td>
                                                    <td className="p-3">{exec.operator?.name || '-'}</td>
                                                    <td className="p-3 text-right font-medium text-emerald-600">
                                                        +{Number(exec.quantityProduced)}
                                                    </td>
                                                    <td className="p-3 text-right text-red-500">
                                                        {Number(exec.scrapQuantity) > 0 ? Number(exec.scrapQuantity) : '-'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="text-center py-8 text-slate-500">
                                    No production output recorded yet.
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="shifts" className="mt-6">
                    <ShiftManager
                        orderId={order.id}
                        shifts={order.shifts || []}
                        operators={formData.operators}
                        helpers={formData.helpers}
                        readOnly={order.status === 'COMPLETED' || order.status === 'CANCELLED'}
                        workShifts={formData.workShifts}
                        machines={formData.machines}
                    />
                </TabsContent>

                {/* ... (Materials, Operations, QC tabs remain same) */}

                <TabsContent value="materials" className="space-y-6 mt-6">
                    <div className="flex justify-between items-center">
                        <h3 className="text-lg font-semibold">Material Requirements</h3>
                        {(order.status === 'IN_PROGRESS' || order.status === 'RELEASED') && (
                            <BatchIssueMaterialDialog
                                order={order}
                                locations={formData.locations}
                                rawMaterials={formData.rawMaterials || []}
                            />
                        )}
                    </div>

                    <Card>
                        <CardContent className="p-0">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-slate-500">
                                    <tr>
                                        <th className="p-3">Material</th>
                                        <th className="p-3 text-right">Plan</th>
                                        <th className="p-3 text-right">Actually Issued</th>
                                        <th className="p-3 text-right">Remaining</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {(order.plannedMaterials || []).map((item: any) => {
                                        const issued = (order.materialIssues || [])
                                            .filter((mi: any) => mi.productVariantId === item.productVariantId)
                                            .reduce((sum: number, mi: any) => sum + Number(mi.quantity), 0);

                                        const required = Number(item.quantity);
                                        const remaining = Math.max(0, required - issued);

                                        return (
                                            <tr key={item.id} className="hover:bg-slate-50/50">
                                                <td className="p-3">
                                                    <div className="flex flex-col">
                                                        <span className="font-medium text-slate-900">{item.productVariant.name}</span>
                                                        <span className="text-[10px] text-blue-600 font-bold uppercase tracking-wider">Planned</span>
                                                    </div>
                                                </td>
                                                <td className="p-3 text-right font-medium text-slate-700">{required.toFixed(2)} {item.productVariant.primaryUnit}</td>
                                                <td className="p-3 text-right">
                                                    <span className={cn(
                                                        issued < required - 0.01 ? "text-amber-600" : "text-emerald-600",
                                                        "font-semibold"
                                                    )}>
                                                        {issued.toFixed(2)}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-right">
                                                    {remaining > 0.01 ? (
                                                        <span className="text-slate-500 font-medium">{remaining.toFixed(2)} {item.productVariant.primaryUnit}</span>
                                                    ) : (
                                                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                                                            ✓ Complete
                                                        </Badge>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}

                                    {/* Handle Substitute Materials */}
                                    {(order.materialIssues || [])
                                        .filter((mi: any) => !(order.plannedMaterials || []).some((pm: any) => pm.productVariantId === mi.productVariantId))
                                        .reduce((acc: any[], mi: any) => {
                                            const existing = acc.find(a => a.productVariantId === mi.productVariantId);
                                            if (existing) {
                                                existing.quantity += Number(mi.quantity);
                                            } else {
                                                acc.push({ ...mi, quantity: Number(mi.quantity) });
                                            }
                                            return acc;
                                        }, [])
                                        .map((sub: any) => (
                                            <tr key={sub.productVariantId} className="bg-amber-50/20 hover:bg-amber-100/30">
                                                <td className="p-3">
                                                    <div className="flex flex-col">
                                                        <span className="font-medium text-slate-900">{sub.productVariant.name}</span>
                                                        <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">Unplanned Issue</span>
                                                    </div>
                                                </td>
                                                <td className="p-3 text-right text-slate-400">-</td>
                                                <td className="p-3 text-right font-semibold text-amber-600">
                                                    {Number(sub.quantity).toFixed(2)} {sub.productVariant.primaryUnit}
                                                </td>
                                                <td className="p-3 text-right text-slate-400">-</td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                        </CardContent>
                    </Card>

                    <div className="mt-6">
                        <h3 className="text-lg font-semibold mb-3">Issue History</h3>
                        {order.materialIssues.length === 0 ? (
                            <p className="text-slate-500 italic">No materials issued yet.</p>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {order.materialIssues.map((issue: any) => (
                                    <div key={issue.id} className="flex justify-between items-center p-3 bg-white rounded-lg border shadow-sm hover:border-slate-300 transition-colors">
                                        <div className="flex flex-col">
                                            <span className="font-medium text-slate-900">{issue.productVariant.name}</span>
                                            <span className="text-[11px] text-slate-400">
                                                {format(new Date(issue.issuedAt), 'PP p')}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="font-mono bg-slate-100 px-2 py-1 rounded text-xs font-semibold">
                                                {Number(issue.quantity)} {issue.productVariant.primaryUnit}
                                            </span>
                                            {(order.status === 'IN_PROGRESS' || order.status === 'RELEASED') && (
                                                <DeleteIssueButton issueId={issue.id} orderId={order.id} />
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </TabsContent>

                <TabsContent value="operations" className="space-y-6 mt-6">
                    <div className="flex justify-between items-center">
                        <h3 className="text-lg font-semibold">Production Logs</h3>
                        {order.status === 'IN_PROGRESS' && (
                            <RecordScrapDialog order={order} locations={formData.locations} />
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Card>
                            <CardHeader><CardTitle className="text-base">Scrap Records</CardTitle></CardHeader>
                            <CardContent>
                                {order.scrapRecords.length === 0 ? <p className="text-slate-500 text-sm">No scrap recorded.</p> : (
                                    <ul className="space-y-2">
                                        {order.scrapRecords.map((scrap: any) => (
                                            <li key={scrap.id} className="flex justify-between items-center text-sm border-b pb-2">
                                                <span>{scrap.productVariant.name}</span>
                                                <Badge variant="outline" className="text-red-600 border-red-200">
                                                    {Number(scrap.quantity)} {scrap.productVariant.primaryUnit}
                                                </Badge>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="qc" className="space-y-6 mt-6">
                    <div className="flex justify-between items-center">
                        <h3 className="text-lg font-semibold">Quality Inspection</h3>
                        {(order.status === 'IN_PROGRESS' || order.status === 'COMPLETED') && (
                            <RecordQCDialog order={order} />
                        )}
                    </div>

                    <div className="space-y-4">
                        {order.inspections.map((insp: any) => (
                            <div key={insp.id} className="p-4 border rounded-lg flex items-start justify-between">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <Badge className={cn(
                                            insp.result === 'PASS' ? "bg-emerald-100 text-emerald-700" :
                                                insp.result === 'FAIL' ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                                        )}>
                                            {insp.result}
                                        </Badge>
                                        <span className="text-sm text-slate-500">at {format(new Date(insp.inspectedAt), 'PP p')}</span>
                                    </div>
                                    <p className="text-sm text-slate-700">{insp.notes || "No notes provided."}</p>
                                </div>
                                <div className="text-xs text-slate-400">
                                    Inspector: {insp.inspector?.name || 'Unknown'}
                                </div>
                            </div>
                        ))}
                        {order.inspections.length === 0 && <p className="text-slate-500">No inspections recorded.</p>}
                    </div>
                </TabsContent>
            </Tabs>
        </div >
    );
}

// --- Sub Components ---

function DetailRow({ label, value }: { label: string, value: string }) {
    return (
        <div className="flex justify-between border-b pb-2 last:border-0 last:pb-0">
            <span className="text-slate-500 text-sm">{label}</span>
            <span className="font-medium text-sm">{value}</span>
        </div>
    );
}

function StatusBadge({ status, size }: { status: string, size?: 'default' | 'lg' }) {
    const styles: Record<string, string> = {
        DRAFT: "bg-slate-100 text-slate-700",
        RELEASED: "bg-blue-100 text-blue-700",
        IN_PROGRESS: "bg-amber-100 text-amber-700",
        COMPLETED: "bg-emerald-100 text-emerald-700",
        CANCELLED: "bg-red-100 text-red-700",
    };
    return (
        <Badge className={cn(styles[status], size === 'lg' ? "px-3 py-1 text-base" : "")}>
            {status.replace('_', ' ')}
        </Badge>
    );
}

