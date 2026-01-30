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
import { ExtendedProductionOrder } from './types';
import { Location, Employee, WorkShift, Machine, ProductVariant } from '@prisma/client';
import { addProductionOutput } from '@/actions/production';
import { cn } from '@/lib/utils';
import { BrandCard, BrandCardContent, BrandCardHeader } from '@/components/brand/BrandCard';

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
        ? order.shifts?.find((ps) => ps.shiftName === matchedShift.name)
        : null;

    const defaultShift = matchedShift?.id || formData.workShifts[0]?.id;
    const defaultOperator = activeProductionShift?.operatorId || formData.operators[0]?.id;

    // Determine Logic based on UOM
    const uom = order.bom.productVariant.primaryUnit || 'KG';
    const itemName = uom === 'ROLL' ? 'Roll' : (uom === 'ZAK' ? 'Sack' : 'Item');

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
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 py-6">
                        {/* LEFT COLUMN: Metadata & Team */}
                        <div className="lg:col-span-5 space-y-6 flex flex-col">
                            <BrandCard variant="default" className="shadow-brand">
                                <BrandCardHeader className="pb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                            <Users className="w-4 h-4 text-primary" />
                                        </div>
                                        <h3 className="font-bold text-base tracking-tight italic uppercase text-foreground">Context & Team</h3>
                                    </div>
                                </BrandCardHeader>

                                <BrandCardContent className="space-y-5">
                                    <div className="space-y-4">
                                        <div>
                                            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest block mb-1">Recorded At</span>
                                            <p className="text-sm font-semibold text-foreground">{new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                                        </div>

                                        <div className="space-y-2">
                                            <Label className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Shift</Label>
                                            <Select name="shiftId" defaultValue={defaultShift} required>
                                                <SelectTrigger className="bg-background/80 border-brand-border h-10 text-foreground font-medium">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {formData.workShifts.map(s => (
                                                        <SelectItem key={s.id} value={s.id}>
                                                            {s.name} ({s.startTime} - {s.endTime})
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            {matchedShift && (
                                                <p className="text-[10px] text-success font-bold uppercase tracking-tight">Active: {matchedShift.name} ({matchedShift.startTime} - {matchedShift.endTime})</p>
                                            )}
                                        </div>

                                        <div className="space-y-2">
                                            <Label className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Lead Operator</Label>
                                            <Select name="operatorId" defaultValue={defaultOperator} required>
                                                <SelectTrigger className="bg-background/80 border-brand-border h-10 text-foreground font-medium">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {formData.operators.map(op => (
                                                        <SelectItem key={op.id} value={op.id}>{op.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </BrandCardContent>
                            </BrandCard>

                            <BrandCard variant="default" className="flex-1 min-h-[300px] flex flex-col shadow-brand">
                                <BrandCardHeader className="justify-between pb-4">
                                    <h3 className="font-bold text-sm tracking-tight italic uppercase text-foreground">Active Helpers</h3>
                                    <span className="bg-primary/20 text-primary text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider border border-primary/20">{selectedHelpers.length} Selected</span>
                                </BrandCardHeader>
                                <BrandCardContent className="flex-1 flex flex-col pt-4">
                                    <div className="flex-1 overflow-y-auto pr-2 space-y-1 custom-scrollbar">
                                        {formData.helpers.map(helper => (
                                            <div
                                                key={helper.id}
                                                className={cn(
                                                    "flex items-center space-x-3 p-3 rounded-lg border transition-all cursor-pointer group",
                                                    selectedHelpers.includes(helper.id)
                                                        ? "bg-primary/10 border-primary/40"
                                                        : "bg-muted/30 border-transparent hover:bg-muted/50 hover:border-brand-border"
                                                )}
                                                onClick={() => toggleHelper(helper.id)}
                                            >
                                                <Checkbox
                                                    id={`helper-${helper.id}`}
                                                    checked={selectedHelpers.includes(helper.id)}
                                                    onCheckedChange={() => toggleHelper(helper.id)}
                                                    className="data-[state=checked]:bg-primary data-[state=checked]:border-primary border-muted-foreground/50"
                                                />
                                                <span className={cn(
                                                    "text-sm font-semibold transition-colors",
                                                    selectedHelpers.includes(helper.id) ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                                                )}>
                                                    {helper.name}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </BrandCardContent>
                            </BrandCard>
                        </div>

                        {/* RIGHT COLUMN: Production Data */}
                        <div className="lg:col-span-7 space-y-6">
                            <BrandCard variant="default" className="shadow-brand">
                                <BrandCardHeader className="justify-between pb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-lg bg-success/10 flex items-center justify-center">
                                            <Package className="w-4 h-4 text-success" />
                                        </div>
                                        <h3 className="font-bold text-base tracking-tight italic uppercase text-foreground">Good Output</h3>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest block">Total Good</span>
                                        <span className="text-2xl font-black text-foreground drop-shadow-sm">{totalGoodQty.toFixed(2)} <span className="text-xs font-normal text-muted-foreground">{uom}</span></span>
                                    </div>
                                </BrandCardHeader>

                                <BrandCardContent className="space-y-5">
                                    <div className="flex gap-3">
                                        <Input
                                            placeholder={`Enter ${itemName} Size/Qty (${uom})...`}
                                            type="number"
                                            step="0.01"
                                            className="flex-1 no-stepper bg-background/80 border-brand-border h-11 text-lg font-mono font-bold text-foreground"
                                            value={currentRollWeight}
                                            onChange={(e) => setCurrentRollWeight(e.target.value)}
                                            onKeyDown={handleKeyDown}
                                        />
                                        <Button type="button" size="lg" onClick={handleAddRoll} disabled={!currentRollWeight} className="h-11 px-8 font-bold italic uppercase tracking-tight shadow-md">Add</Button>
                                    </div>

                                    <div className="h-[250px] overflow-y-auto border border-brand-border/50 rounded-xl bg-muted/20 p-4 custom-scrollbar">
                                        {rolls.length === 0 && (
                                            <div className="flex flex-col items-center justify-center h-full text-muted-foreground/60 italic">
                                                <Package className="w-10 h-10 opacity-10 mb-3" />
                                                <span className="text-sm font-medium">No {itemName.toLowerCase()}s recorded for this run</span>
                                            </div>
                                        )}
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                            {rolls.map((weight, idx) => (
                                                <div key={idx} className="group relative flex flex-col items-center justify-center bg-brand-glass backdrop-blur-md border border-brand-border p-4 rounded-xl shadow-sm transition-all hover:bg-brand-glass-heavy hover:border-brand-border-heavy hover:shadow-brand">
                                                    <span className="text-[10px] text-muted-foreground uppercase font-black tracking-widest mb-1 opacity-70">{itemName} {idx + 1}</span>
                                                    <span className="text-base font-mono font-bold text-foreground">{weight} <span className="text-[10px] font-normal opacity-70 uppercase">{uom}</span></span>
                                                    <button
                                                        type="button"
                                                        className="absolute -top-1.5 -right-1.5 h-6 w-6 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:scale-110 shadow-lg z-10"
                                                        onClick={() => removeRoll(idx)}
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </BrandCardContent>
                            </BrandCard>

                            <BrandCard variant="default" className="shadow-brand">
                                <BrandCardHeader className="pb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-lg bg-warning/10 flex items-center justify-center">
                                            <AlertTriangle className="w-4 h-4 text-warning" />
                                        </div>
                                        <h3 className="font-bold text-base tracking-tight italic uppercase text-foreground">Production Waste / Scrap</h3>
                                    </div>
                                </BrandCardHeader>
                                <BrandCardContent className="space-y-5">
                                    <div className="grid grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <Label className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Affal Prongkol (Lumps)</Label>
                                            <div className="flex items-center gap-3 relative">
                                                <Input
                                                    type="number" step="0.01"
                                                    placeholder="0.00"
                                                    className="text-right no-stepper bg-background/80 border-brand-border h-10 font-mono font-bold pr-8 text-foreground"
                                                    value={scrapProngkol}
                                                    onChange={(e) => setScrapProngkol(e.target.value)}
                                                />
                                                <span className="absolute right-3 text-[10px] text-muted-foreground font-bold uppercase pointer-events-none">kg</span>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Affal Daun (Trim)</Label>
                                            <div className="flex items-center gap-3 relative">
                                                <Input
                                                    type="number" step="0.01"
                                                    placeholder="0.00"
                                                    className="text-right no-stepper bg-background/80 border-brand-border h-10 font-mono font-bold pr-8 text-foreground"
                                                    value={scrapDaun}
                                                    onChange={(e) => setScrapDaun(e.target.value)}
                                                />
                                                <span className="absolute right-3 text-[10px] text-muted-foreground font-bold uppercase pointer-events-none">kg</span>
                                            </div>
                                        </div>
                                    </div>
                                </BrandCardContent>
                            </BrandCard>

                            <BrandCard variant="default" className="shadow-brand">
                                <BrandCardContent className="pt-8">
                                    <div className="space-y-3">
                                        <Label className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Notes / Comments</Label>
                                        <Textarea
                                            className="h-[80px] bg-background/80 border-brand-border resize-none text-foreground placeholder:text-muted-foreground/50"
                                            placeholder="Add any specific observations or issues during this production run..."
                                            name="notes"
                                            value={notes}
                                            onChange={(e) => setNotes(e.target.value)}
                                        />
                                    </div>
                                </BrandCardContent>
                            </BrandCard>
                        </div>
                    </div>

                    <DialogFooter className="mt-8 border-t border-brand-border pt-6 pb-2">
                        <Button type="button" variant="ghost" className="font-bold tracking-tight italic uppercase" onClick={() => setOpen(false)}>Cancel Action</Button>
                        <Button
                            type="submit"
                            size="lg"
                            className="px-10 font-bold tracking-tight italic uppercase shadow-brand"
                            disabled={rolls.length === 0 && !scrapProngkol && !scrapDaun}
                        >
                            Confirm Production Record
                        </Button>
                    </DialogFooter>

                </form>
            </DialogContent>
        </Dialog>
    );
}
