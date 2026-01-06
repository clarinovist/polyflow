import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Plus, Users, Package, AlertTriangle, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { ExtendedProductionOrder } from './types';
import { Location, Employee, WorkShift, Machine, ProductVariant } from '@prisma/client';
import { addProductionOutput } from '@/actions/production';

interface FormData {
    locations: Location[];
    operators: Employee[];
    helpers: Employee[];
    workShifts: WorkShift[];
    machines: Machine[];
    rawMaterials: ProductVariant[];
}

export function AddOutputDialog({ order, formData }: { order: ExtendedProductionOrder, formData: FormData }) {
    const [open, setOpen] = useState(false);
    const [rolls, setRolls] = useState<number[]>([]);
    const [currentRollWeight, setCurrentRollWeight] = useState("");

    // New Scrap Inputs
    const [scrapProngkol, setScrapProngkol] = useState("");
    const [scrapDaun, setScrapDaun] = useState("");

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
            scrapProngkolQty: Number(scrapProngkol || 0),
            scrapDaunQty: Number(scrapDaun || 0),
            scrapQuantity: 0, // Legacy/Required by type
            startTime: new Date(nowIso), // Always NOW
            endTime: new Date(nowIso),   // Always NOW
            notes: finalNotes
        };

        const result = await addProductionOutput(data);
        if (result.success) {
            toast.success("Production output recorded");
            setOpen(false);
            setRolls([]);
            setScrapProngkol("");
            setScrapDaun("");
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
                            <div className="space-y-4 border-t pt-4">
                                <h3 className="font-semibold text-red-700 flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4" /> Production Waste / Scrap
                                </h3>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-xs text-slate-500">Affal Prongkol (Lumps)</Label>
                                        <div className="flex items-center gap-2">
                                            <Input
                                                type="number" step="0.01"
                                                placeholder="0.00"
                                                className="text-right"
                                                value={scrapProngkol}
                                                onChange={(e) => setScrapProngkol(e.target.value)}
                                            />
                                            <span className="text-sm text-slate-500">kg</span>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs text-slate-500">Affal Daun (Trim)</Label>
                                        <div className="flex items-center gap-2">
                                            <Input
                                                type="number" step="0.01"
                                                placeholder="0.00"
                                                className="text-right"
                                                value={scrapDaun}
                                                onChange={(e) => setScrapDaun(e.target.value)}
                                            />
                                            <span className="text-sm text-slate-500">kg</span>
                                        </div>
                                    </div>
                                </div>
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
                        <Button type="submit" disabled={rolls.length === 0 && !scrapProngkol && !scrapDaun}>Save Record</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
