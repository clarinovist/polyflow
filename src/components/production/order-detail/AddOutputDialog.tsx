import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Plus, Users, Package, AlertTriangle, Trash2, Loader2 } from 'lucide-react';
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
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [rolls, setRolls] = useState<number[]>([]);
    const [currentRollWeight, setCurrentRollWeight] = useState("");

    // New Scrap Inputs
    const [scrapProngkol, setScrapProngkol] = useState("");
    const [scrapDaun, setScrapDaun] = useState("");

    const [notes, setNotes] = useState("");
    const [selectedHelpers, setSelectedHelpers] = useState<string[]>([]);

    // Auto-detect Shift
    const { matchedShift, defaultShift, defaultOperator } = useMemo(() => {
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const currentTimeVal = currentHour * 60 + currentMinute;

        const matched = formData.workShifts.find(shift => {
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

        const activeProdShift = matched
            ? order.shifts?.find((ps) => ps.shiftName === matched.name)
            : null;

        return {
            matchedShift: matched,
            defaultShift: matched?.id || formData.workShifts[0]?.id,
            defaultOperator: activeProdShift?.operatorId || formData.operators[0]?.id
        };
    }, [formData.workShifts, formData.operators, order.shifts]);

    // Determine Logic based on UOM
    const uom = order.bom.productVariant.primaryUnit || 'KG';
    const itemName = uom === 'ROLL' ? 'Roll' : (uom === 'ZAK' ? 'Sack' : 'Item');

    const handleHelperChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedOptions = Array.from(e.target.selectedOptions, option => option.value);
        setSelectedHelpers(selectedOptions);
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
        if (isSubmitting) return;
        setIsSubmitting(true);
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
        setIsSubmitting(false);
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
                        <div className="lg:col-span-4 space-y-6 flex flex-col">
                            <BrandCard variant="default" className="shadow-brand h-full">
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
                                            <div className="relative">
                                                <select
                                                    name="shiftId"
                                                    defaultValue={defaultShift}
                                                    required
                                                    className="flex h-10 w-full items-center justify-between rounded-md border border-brand-border bg-background/80 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none"
                                                >
                                                    {formData.workShifts.map(s => (
                                                        <option key={s.id} value={s.id}>
                                                            {s.name} ({s.startTime} - {s.endTime})
                                                        </option>
                                                    ))}
                                                </select>
                                                <div className="pointer-events-none absolute right-3 top-3 opacity-50">
                                                    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                        <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                                    </svg>
                                                </div>
                                            </div>
                                            {matchedShift && (
                                                <p className="text-[10px] text-success font-bold uppercase tracking-tight">Active: {matchedShift.name} ({matchedShift.startTime} - {matchedShift.endTime})</p>
                                            )}
                                        </div>

                                        <div className="space-y-2">
                                            <Label className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Lead Operator</Label>
                                            <div className="relative">
                                                <select
                                                    name="operatorId"
                                                    defaultValue={defaultOperator}
                                                    required
                                                    className="flex h-10 w-full items-center justify-between rounded-md border border-brand-border bg-background/80 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none"
                                                >
                                                    {formData.operators.map(op => (
                                                        <option key={op.id} value={op.id}>{op.name}</option>
                                                    ))}
                                                </select>
                                                <div className="pointer-events-none absolute right-3 top-3 opacity-50">
                                                    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                        <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                                    </svg>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Helpers (Hold Ctrl/Cmd to select multiple)</Label>
                                            <div className="relative">
                                                <select
                                                    multiple
                                                    value={selectedHelpers}
                                                    onChange={handleHelperChange}
                                                    className="flex h-32 w-full rounded-md border border-brand-border bg-background/80 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                    {formData.helpers.map(h => (
                                                        <option key={h.id} value={h.id}>{h.name}</option>
                                                    ))}
                                                </select>
                                                <p className="text-[10px] text-muted-foreground mt-1">
                                                    {selectedHelpers.length > 0 ? `${selectedHelpers.length} helper(s) selected` : "No helpers selected"}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </BrandCardContent>
                            </BrandCard>
                        </div>

                        {/* RIGHT COLUMN: Production Data */}
                        <div className="lg:col-span-8 space-y-6">
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
                        <Button type="button" variant="ghost" className="font-bold tracking-tight italic uppercase" onClick={() => setOpen(false)}>Cancel</Button>
                        <Button
                            type="submit"
                            size="lg"
                            className="px-10 font-bold tracking-tight italic uppercase shadow-brand"
                            disabled={isSubmitting || (rolls.length === 0 && !scrapProngkol && !scrapDaun)}
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Recording...
                                </>
                            ) : (
                                'Record Output'
                            )}
                        </Button>
                    </DialogFooter>

                </form>
            </DialogContent>
        </Dialog>
    );
}
