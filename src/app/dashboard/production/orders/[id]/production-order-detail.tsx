'use client';

import {
    ProductionOrder, Bom, Machine, Location, User, MaterialIssue, ScrapRecord, QualityInspection,
    ProductionStatus,
    ProductVariant,
    Employee,
    WorkShift,
    ProductionExecution
} from '@prisma/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { updateProductionOrder, recordMaterialIssue, recordScrap, recordQualityInspection, addProductionOutput } from '@/actions/production';
import { format } from 'date-fns';
import { useState } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import {
    Play, CheckCircle, Package, AlertTriangle, FileText,
    Settings, Users, ClipboardCheck, ArrowRight, XCircle, ArrowLeft, Plus, History, Trash2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';

import { ShiftManager } from '@/components/production/ShiftManager';

// Extended Types to match Server Action Return
type ExtendedProductionOrder = ProductionOrder & {
    bom: Bom & { productVariant: ProductVariant & { product: any }, items: any[] };
    machine: Machine | null;
    location: Location;
    shifts: (any)[];
    materialIssues: (MaterialIssue & { productVariant: ProductVariant, createdBy: User | null })[];
    scrapRecords: (ScrapRecord & { productVariant: ProductVariant, createdBy: User | null })[];
    inspections: (QualityInspection & { inspector: User | null })[];
    executions: (ProductionExecution & { operator: Employee | null, shift: WorkShift | null })[];
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

    const plannedQty = Number(order.plannedQuantity);
    const actualQty = Number(order.actualQuantity || 0);
    const progress = Math.min((actualQty / plannedQty) * 100, 100);

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


            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-5 lg:w-[500px]">
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="shifts">Shifts</TabsTrigger>
                    <TabsTrigger value="materials">Materials</TabsTrigger>
                    <TabsTrigger value="operations">Operations</TabsTrigger>
                    <TabsTrigger value="qc">QC</TabsTrigger>
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

                                        // Also consider BACKFLUSHED quantities if we want to show strict Real-time consumption
                                        // But our schema separates MaterialIssue (manual) from ProductionExecution (backflush inference).
                                        // Ideally we should query Inventory Transactions to know true consumption.
                                        // For now, let's keep showing "Issued" as Manual Issues, 
                                        // OR we could add a note.

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

function AddOutputDialog({ order, formData }: { order: ExtendedProductionOrder, formData: PageProps['formData'] }) {
    const [open, setOpen] = useState(false);
    const [rolls, setRolls] = useState<number[]>([]);
    const [currentRollWeight, setCurrentRollWeight] = useState("");
    const [scrapWeight, setScrapWeight] = useState("");
    const [notes, setNotes] = useState("");
    const [selectedHelpers, setSelectedHelpers] = useState<string[]>([]);

    // Auto-detect Shift
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTimeVal = currentHour * 60 + currentMinute;

    const matchedShift = formData.workShifts.find(shift => {
        const [startH, startM] = shift.startTime.split(':').map(Number);
        const [endH, endM] = shift.endTime.split(':').map(Number);
        const startVal = startH * 60 + startM;
        const endVal = endH * 60 + endM;

        if (startVal <= endVal) {
            return currentTimeVal >= startVal && currentTimeVal <= endVal;
        } else {
            return currentTimeVal >= startVal || currentTimeVal <= endVal;
        }
    });

    const activeProductionShift = matchedShift
        ? order.shifts?.find((ps: any) => ps.shiftName === matchedShift.name)
        : null;

    const defaultShift = matchedShift?.id || formData.workShifts[0]?.id;
    const defaultOperator = activeProductionShift?.operatorId || formData.operators[0]?.id;

    // Helper handling
    const toggleHelper = (helperId: string) => {
        if (selectedHelpers.includes(helperId)) {
            setSelectedHelpers(selectedHelpers.filter(id => id !== helperId));
        } else {
            setSelectedHelpers([...selectedHelpers, helperId]);
        }
    };

    const handleAddRoll = () => {
        const weight = parseFloat(currentRollWeight);
        if (!isNaN(weight) && weight > 0) {
            setRolls([...rolls, weight]);
            setCurrentRollWeight("");
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAddRoll();
        }
    };

    const removeRoll = (index: number) => {
        setRolls(rolls.filter((_, i) => i !== index));
    };

    const totalGoodQty = rolls.reduce((sum, w) => sum + w, 0);

    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);

        let finalNotes = notes || "";

        // Append Helpers
        if (selectedHelpers.length > 0) {
            const helperNames = formData.helpers
                .filter(h => selectedHelpers.includes(h.id))
                .map(h => h.name)
                .join(", ");
            finalNotes += `\nHelpers: ${helperNames}`;
        }

        // Append Rolls
        if (rolls.length > 0) {
            finalNotes += `\n[Auto-Generated] Individual Rolls: ${rolls.join(', ')}`;
        }

        const nowIso = new Date().toISOString();

        const data = {
            productionOrderId: order.id,
            machineId: order.machineId || undefined,
            operatorId: fd.get('operatorId') as string,
            shiftId: fd.get('shiftId') as string,
            quantityProduced: totalGoodQty,
            scrapQuantity: Number(scrapWeight || 0),
            startTime: new Date(nowIso), // Always NOW
            endTime: new Date(nowIso),   // Always NOW
            notes: finalNotes
        };

        const result = await addProductionOutput(data);
        if (result.success) {
            toast.success("Production output recorded");
            setOpen(false);
            setRolls([]);
            setScrapWeight("");
            setNotes("");
            setCurrentRollWeight("");
            setSelectedHelpers([]);
        } else {
            toast.error(result.error);
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button>
                    <Plus className="w-4 h-4 mr-2" /> Add Output
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[900px]">
                <DialogHeader><DialogTitle>Record Production Output</DialogTitle></DialogHeader>
                <form onSubmit={onSubmit}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* LEFT COLUMN: Context & Resources */}
                        <div className="space-y-6">
                            <div className="p-4 bg-slate-50 rounded-lg border space-y-4">
                                <h3 className="font-semibold text-slate-700 flex items-center gap-2">
                                    <Users className="w-4 h-4" /> Context & Team
                                </h3>

                                <div className="space-y-3">
                                    <div className="space-y-1">
                                        <Label className="text-xs text-slate-500">Recorded At</Label>
                                        <div className="text-sm font-medium">
                                            {format(new Date(), 'PP p')}
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <Label className="text-xs">Shift</Label>
                                        <Select name="shiftId" defaultValue={defaultShift} required>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {formData.workShifts.map(s => (
                                                    <SelectItem key={s.id} value={s.id}>
                                                        {s.name} <span className="text-slate-400 text-xs ml-2">({s.startTime} - {s.endTime})</span>
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        {matchedShift && (
                                            <p className="text-xs text-emerald-600">
                                                Active: {matchedShift.name} ({matchedShift.startTime} - {matchedShift.endTime})
                                            </p>
                                        )}
                                    </div>

                                    <div className="space-y-1">
                                        <Label className="text-xs">Lead Operator</Label>
                                        <Select name="operatorId" defaultValue={defaultOperator} required>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {formData.operators.map(op => <SelectItem key={op.id} value={op.id}>{op.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-sm font-medium">Active Helpers</Label>
                                <div className="border rounded-md p-3 h-[200px] overflow-y-auto space-y-2 bg-slate-50/50">
                                    {formData.helpers.map(helper => (
                                        <div key={helper.id} className="flex items-center space-x-2">
                                            <Checkbox
                                                id={`helper-${helper.id}`}
                                                checked={selectedHelpers.includes(helper.id)}
                                                onCheckedChange={() => toggleHelper(helper.id)}
                                            />
                                            <label
                                                htmlFor={`helper-${helper.id}`}
                                                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                                            >
                                                {helper.name}
                                            </label>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* RIGHT COLUMN: Production Data */}
                        <div className="space-y-6">
                            {/* Good Goods (Rolls) */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between border-b pb-2">
                                    <h3 className="font-semibold text-emerald-700 flex items-center gap-2">
                                        <Package className="w-4 h-4" /> Good Output
                                    </h3>
                                    <div className="text-right">
                                        <span className="text-xs text-slate-500 block">Total Good</span>
                                        <span className="text-xl font-bold text-emerald-600">{totalGoodQty.toFixed(2)} <span className="text-sm font-normal text-slate-400">kg</span></span>
                                    </div>
                                </div>

                                <div className="flex gap-2">
                                    <Input
                                        placeholder="Enter Roll Weight (kg)..."
                                        type="number"
                                        step="0.01"
                                        className="flex-1"
                                        value={currentRollWeight}
                                        onChange={(e) => setCurrentRollWeight(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                    />
                                    <Button type="button" onClick={handleAddRoll} disabled={!currentRollWeight}>Add</Button>
                                </div>

                                <div className="h-[140px] overflow-y-auto border rounded-md bg-slate-50 p-2 space-y-1">
                                    {rolls.length === 0 && (
                                        <div className="flex flex-col items-center justify-center h-full text-slate-400 text-sm">
                                            <Package className="w-8 h-8 opacity-20 mb-2" />
                                            <span>No rolls added yet</span>
                                        </div>
                                    )}
                                    {rolls.map((weight, idx) => (
                                        <div key={idx} className="flex items-center justify-between bg-white p-2 border rounded shadow-sm text-sm">
                                            <span className="font-medium">Roll {idx + 1}</span>
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono">{weight} kg</span>
                                                <Button type="button" variant="ghost" size="icon" className="h-5 w-5 text-red-400 hover:text-red-600" onClick={() => removeRoll(idx)}>
                                                    <Trash2 className="w-3 h-3" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Scrap / Waste */}
                            <div className="flex items-center justify-between border-t pt-4">
                                <div className="flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4 text-red-600" />
                                    <Label className="text-red-700 font-medium">Scrap / Waste (kg)</Label>
                                </div>
                                <Input
                                    type="number" step="0.01"
                                    placeholder="0.00"
                                    className="w-[120px] text-right"
                                    value={scrapWeight}
                                    onChange={(e) => setScrapWeight(e.target.value)}
                                />
                            </div>

                            <div className="space-y-2 border-t pt-4">
                                <Label>Notes / Comments</Label>
                                <Textarea
                                    className="h-[80px]"
                                    placeholder="Optional notes..."
                                    name="notes"
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="mt-6">
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                        <Button type="submit" disabled={rolls.length === 0 && !scrapWeight}>Save Record</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

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
