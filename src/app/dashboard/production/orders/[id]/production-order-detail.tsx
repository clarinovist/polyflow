'use client';

import {
    ProductionOrder, Bom, Machine, Location, User, MaterialIssue, ScrapRecord, QualityInspection,
    ProductionStatus,
    ProductVariant,
    Employee,
    WorkShift
} from '@prisma/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { updateProductionOrder, recordMaterialIssue, recordScrap, recordQualityInspection } from '@/actions/production';
import { format } from 'date-fns';
import { useState } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import {
    Play, CheckCircle, Package, AlertTriangle, FileText,
    Settings, Users, ClipboardCheck, ArrowRight, XCircle, ArrowLeft
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

import { ShiftManager } from '@/components/production/ShiftManager';
// Removed duplicate import

// ... (other imports remain)

// Extended Types to match Server Action Return
type ExtendedProductionOrder = ProductionOrder & {
    bom: Bom & { productVariant: ProductVariant & { product: any }, items: any[] };
    machine: Machine | null;
    location: Location;
    shifts: (any)[]; // Using any for simplicity as ShiftManager handles types strictly
    materialIssues: (MaterialIssue & { productVariant: ProductVariant, createdBy: User | null })[];
    scrapRecords: (ScrapRecord & { productVariant: ProductVariant, createdBy: User | null })[];
    inspections: (QualityInspection & { inspector: User | null })[];
}

interface PageProps {
    order: any; // Type assertion needed due to serialization
    formData: {
        locations: Location[];
        operators: Employee[];
        helpers: Employee[];
        workShifts: WorkShift[];
    }
}


export function ProductionOrderDetail({ order: initialOrder, formData }: PageProps) {
    const order = initialOrder as ExtendedProductionOrder;
    const [activeTab, setActiveTab] = useState("overview");

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
                        <span className="flex items-center gap-1"><CheckCircle className="w-4 h-4" /> {Number(order.actualQuantity || 0)} / {Number(order.plannedQuantity)} {order.bom.productVariant.primaryUnit}</span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {order.status === 'DRAFT' && (
                        <Button onClick={() => updateProductionOrder({ id: order.id, status: 'RELEASED' })}>
                            Release Order
                        </Button>
                    )}
                    {order.status === 'RELEASED' && (
                        <Button onClick={() => updateProductionOrder({ id: order.id, status: 'IN_PROGRESS' })}>
                            <Play className="w-4 h-4 mr-2" /> Start Production
                        </Button>
                    )}
                    {order.status === 'IN_PROGRESS' && (
                        <Button onClick={() => updateProductionOrder({ id: order.id, status: 'COMPLETED' })}>
                            <CheckCircle className="w-4 h-4 mr-2" /> Complete Order
                        </Button>
                    )}
                </div>
            </div>


            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-5 lg:w-[500px]">
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="shifts">Shifts</TabsTrigger>
                    <TabsTrigger value="materials">Materials</TabsTrigger>
                    <TabsTrigger value="operations">Operations</TabsTrigger>
                    <TabsTrigger value="qc">QC</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-6 mt-6">
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
                </TabsContent>

                <TabsContent value="shifts" className="mt-6">
                    <ShiftManager
                        orderId={order.id}
                        shifts={order.shifts || []}
                        operators={formData.operators}
                        helpers={formData.helpers}
                        readOnly={order.status === 'COMPLETED' || order.status === 'CANCELLED'}
                        workShifts={formData.workShifts}
                    />
                </TabsContent>

                {/* ... (Materials, Operations, QC tabs remain same) */}

                <TabsContent value="materials" className="space-y-6 mt-6">
                    <div className="flex justify-between items-center">
                        <h3 className="text-lg font-semibold">Material Usage</h3>
                        {order.status === 'IN_PROGRESS' && (
                            <IssueMaterialDialog order={order} locations={formData.locations} />
                        )}
                    </div>

                    <Card>
                        <CardContent className="p-0">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-slate-500">
                                    <tr>
                                        <th className="p-3">Material</th>
                                        <th className="p-3">Required (Plan)</th>
                                        <th className="p-3">Actually Issued</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {order.bom.items.map((item: any) => {
                                        // Calculate total issued for this variant
                                        const issued = order.materialIssues
                                            .filter((mi: any) => mi.productVariantId === item.productVariantId)
                                            .reduce((sum: number, mi: any) => sum + Number(mi.quantity), 0);

                                        const required = (Number(item.quantity) / Number(order.bom.outputQuantity)) * Number(order.plannedQuantity);

                                        return (
                                            <tr key={item.id}>
                                                <td className="p-3 font-medium">{item.productVariant.name}</td>
                                                <td className="p-3">{required.toFixed(2)} {item.productVariant.primaryUnit}</td>
                                                <td className="p-3">
                                                    <span className={cn(
                                                        issued < required ? "text-amber-600" : "text-emerald-600",
                                                        "font-medium"
                                                    )}>
                                                        {issued.toFixed(2)}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </CardContent>
                    </Card>

                    <div className="mt-6">
                        <h3 className="text-lg font-semibold mb-3">Issue History</h3>
                        {order.materialIssues.length === 0 ? <p className="text-slate-500">No materials issued yet.</p> : (
                            <div className="space-y-2">
                                {order.materialIssues.map((issue: any) => (
                                    <div key={issue.id} className="flex justify-between p-3 bg-slate-50 rounded border">
                                        <span>{issue.productVariant.name}</span>
                                        <span className="font-mono">{Number(issue.quantity)} {issue.productVariant.primaryUnit}</span>
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
        </div>
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

// --- Dialogs ---

function IssueMaterialDialog({ order, locations }: { order: ExtendedProductionOrder, locations: Location[] }) {
    const defaultLocation = order.machine?.locationId || locations[0]?.id;
    // For simplicity, issue standard raw materials from BOM.
    // In real app, might want to lookup specific stock available.

    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const data = {
            productionOrderId: order.id,
            productVariantId: formData.get('productVariantId') as string,
            locationId: formData.get('locationId') as string,
            quantity: Number(formData.get('quantity'))
        };
        await recordMaterialIssue(data);
    }

    return (
        <Dialog>
            <DialogTrigger asChild><Button variant="outline" size="sm">Issue Material</Button></DialogTrigger>
            <DialogContent>
                <DialogHeader><DialogTitle>Issue Material</DialogTitle></DialogHeader>
                <form onSubmit={onSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label>Material</Label>
                        <Select name="productVariantId" required>
                            <SelectTrigger><SelectValue placeholder="Select Material" /></SelectTrigger>
                            <SelectContent>
                                {order.bom.items.map((item: any) => (
                                    <SelectItem key={item.id} value={item.productVariantId}>
                                        {item.productVariant.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Source Location</Label>
                        <Select name="locationId" defaultValue={defaultLocation} required>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {locations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Quantity</Label>
                        <Input type="number" step="0.01" name="quantity" required />
                    </div>
                    <Button type="submit" className="w-full">Confirm Issue</Button>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function RecordScrapDialog({ order, locations }: { order: ExtendedProductionOrder, locations: Location[] }) {
    // Usually scrap is the output product variant marked as scrap? or just loss? 
    // Plan: we need a list of scrap items. For now, let's allow selecting any item or just the output item (as waste).
    // Actually, usually you produce SCRAP item.
    // Let's assume user picks from BOM items (waste of input) or Output (bad goods).

    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const data = {
            productionOrderId: order.id,
            productVariantId: formData.get('productVariantId') as string,
            locationId: formData.get('locationId') as string,
            quantity: Number(formData.get('quantity')),
            reason: formData.get('reason') as string
        };
        await recordScrap(data);
    }

    return (
        <Dialog>
            <DialogTrigger asChild><Button variant="destructive" size="sm">Record Scrap</Button></DialogTrigger>
            <DialogContent>
                <DialogHeader><DialogTitle>Record Scrap/Waste</DialogTitle></DialogHeader>
                <form onSubmit={onSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label>Item Scrapped</Label>
                        <Select name="productVariantId" required>
                            <SelectTrigger><SelectValue placeholder="Select Item" /></SelectTrigger>
                            <SelectContent>
                                {/* Output Item as Bad Goods */}
                                <SelectItem value={order.bom.productVariantId}>[Output] {order.bom.productVariant.name}</SelectItem>
                                {/* Input Items as Waste */}
                                {order.bom.items.map((item: any) => (
                                    <SelectItem key={item.id} value={item.productVariantId}>[Input] {item.productVariant.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Location (Scrap Bin)</Label>
                        <Select name="locationId" required>
                            <SelectTrigger><SelectValue placeholder="Select Location" /></SelectTrigger>
                            <SelectContent>
                                {locations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Quantity</Label>
                        <Input type="number" step="0.01" name="quantity" required />
                    </div>
                    <div className="space-y-2">
                        <Label>Reason</Label>
                        <Input name="reason" placeholder="e.g. Machine setup, Contamination" />
                    </div>
                    <Button type="submit" variant="destructive" className="w-full">Record Scrap</Button>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function RecordQCDialog({ order }: { order: ExtendedProductionOrder }) {
    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const data = {
            productionOrderId: order.id,
            result: formData.get('result') as any,
            notes: formData.get('notes') as string
        };
        await recordQualityInspection(data);
    }

    return (
        <Dialog>
            <DialogTrigger asChild><Button size="sm">Add Inspection</Button></DialogTrigger>
            <DialogContent>
                <DialogHeader><DialogTitle>Quality Inspection</DialogTitle></DialogHeader>
                <form onSubmit={onSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label>Result</Label>
                        <Select name="result" required>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="PASS">PASS</SelectItem>
                                <SelectItem value="FAIL">FAIL</SelectItem>
                                <SelectItem value="QUARANTINE">QUARANTINE</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Notes</Label>
                        <Textarea name="notes" placeholder="Inspection comments..." />
                    </div>
                    <Button type="submit" className="w-full">Save Result</Button>
                </form>
            </DialogContent>
        </Dialog>
    );
}
