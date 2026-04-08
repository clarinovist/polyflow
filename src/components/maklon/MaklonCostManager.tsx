'use client';

import { useState, useTransition } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { PlusCircle, Trash2, Wrench, Zap, Users, FlaskConical, Droplets, Building, CircleDollarSign } from 'lucide-react';
import { formatRupiah } from '@/lib/utils/utils';
import { addMaklonCostAction, removeMaklonCostAction } from '@/actions/maklon/maklon-cost';

type MaklonCostType = 'LABOR' | 'MACHINE' | 'ELECTRICITY' | 'ADDITIVE' | 'COLORANT' | 'OVERHEAD' | 'OTHER';

type CostItem = {
    id: string;
    costType: MaklonCostType;
    description: string | null;
    amount: string | number;
};

const COST_TYPE_CONFIG: Record<MaklonCostType, { label: string; icon: React.ElementType; color: string }> = {
    LABOR:       { label: 'Labor',       icon: Users,          color: 'bg-blue-100 text-blue-700 border-blue-200' },
    MACHINE:     { label: 'Machine',     icon: Wrench,         color: 'bg-slate-100 text-slate-700 border-slate-200' },
    ELECTRICITY: { label: 'Electricity', icon: Zap,            color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
    ADDITIVE:    { label: 'Additive',    icon: FlaskConical,   color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    COLORANT:    { label: 'Colorant',    icon: Droplets,       color: 'bg-pink-100 text-pink-700 border-pink-200' },
    OVERHEAD:    { label: 'Overhead',    icon: Building,       color: 'bg-orange-100 text-orange-700 border-orange-200' },
    OTHER:       { label: 'Other',       icon: CircleDollarSign, color: 'bg-muted text-muted-foreground border-muted' },
};

interface MaklonCostManagerProps {
    productionOrderId: string;
    initialItems: CostItem[];
}

export function MaklonCostManager({ productionOrderId, initialItems }: MaklonCostManagerProps) {
    const [items, setItems] = useState<CostItem[]>(initialItems);
    const [open, setOpen] = useState(false);
    const [isPending, startTransition] = useTransition();

    // form state
    const [costType, setCostType] = useState<MaklonCostType>('LABOR');
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');

    const total = items.reduce((sum, item) => sum + Number(item.amount), 0);

    const handleAdd = () => {
        const parsedAmount = parseFloat(amount.replace(/[^0-9.]/g, ''));
        if (!parsedAmount || parsedAmount <= 0) {
            toast.error('Please enter a valid amount greater than 0');
            return;
        }

        startTransition(async () => {
            const result = await addMaklonCostAction({
                productionOrderId,
                costType,
                amount: parsedAmount,
                description: description.trim() || undefined,
            });

            if (result?.success) {
                // Optimistic: add a temp item (the page will revalidate and replace with real data)
                const tempItem: CostItem = {
                    id: `temp-${Date.now()}`,
                    costType,
                    description: description.trim() || null,
                    amount: parsedAmount,
                };
                setItems(prev => [...prev, tempItem]);
                toast.success('Cost item added successfully');
                setOpen(false);
                setCostType('LABOR');
                setAmount('');
                setDescription('');
            } else {
                toast.error(result?.error || 'Failed to add cost item');
            }
        });
    };

    const handleRemove = (id: string) => {
        startTransition(async () => {
            const result = await removeMaklonCostAction(id, productionOrderId);
            if (result?.success) {
                setItems(prev => prev.filter(item => item.id !== id));
                toast.success('Cost item removed');
            } else {
                toast.error(result?.error || 'Failed to remove cost item');
            }
        });
    };

    return (
        <Card className="border-purple-200 bg-purple-50/30">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-base flex items-center gap-2 text-purple-800">
                            <CircleDollarSign className="w-4 h-4" />
                            Maklon Conversion Costs
                        </CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Record itemised conversion costs charged to customer for this Maklon order
                        </p>
                    </div>
                    <Dialog open={open} onOpenChange={setOpen}>
                        <DialogTrigger asChild>
                            <Button size="sm" className="bg-purple-600 hover:bg-purple-700 gap-1.5">
                                <PlusCircle className="w-3.5 h-3.5" />
                                Add Cost
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[420px]">
                            <DialogHeader>
                                <DialogTitle>Add Conversion Cost</DialogTitle>
                                <DialogDescription>
                                    Add a cost line item for this Maklon production order.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-2">
                                <div className="space-y-2">
                                    <Label>Cost Type</Label>
                                    <Select value={costType} onValueChange={(v) => setCostType(v as MaklonCostType)}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {(Object.keys(COST_TYPE_CONFIG) as MaklonCostType[]).map(type => {
                                                const cfg = COST_TYPE_CONFIG[type];
                                                const Icon = cfg.icon;
                                                return (
                                                    <SelectItem key={type} value={type}>
                                                        <span className="flex items-center gap-2">
                                                            <Icon className="w-3.5 h-3.5" />
                                                            {cfg.label}
                                                        </span>
                                                    </SelectItem>
                                                );
                                            })}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Amount (Rp)</Label>
                                    <Input
                                        type="number"
                                        placeholder="e.g. 150000"
                                        value={amount}
                                        onChange={e => setAmount(e.target.value)}
                                        min={0}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Description <span className="text-muted-foreground font-normal">(Optional)</span></Label>
                                    <Input
                                        placeholder="e.g. 8 hours operator labor"
                                        value={description}
                                        onChange={e => setDescription(e.target.value)}
                                    />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
                                    Cancel
                                </Button>
                                <Button
                                    className="bg-purple-600 hover:bg-purple-700"
                                    onClick={handleAdd}
                                    disabled={isPending || !amount}
                                >
                                    {isPending ? 'Saving...' : 'Save Cost'}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </CardHeader>
            <CardContent>
                {items.length === 0 ? (
                    <div className="text-center py-8 border-2 border-dashed border-purple-200 rounded-lg">
                        <CircleDollarSign className="w-8 h-8 mx-auto mb-2 text-purple-300" />
                        <p className="text-sm text-muted-foreground">No conversion costs recorded yet.</p>
                        <p className="text-xs text-muted-foreground mt-1">Click &quot;Add Cost&quot; to start recording.</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {items.map(item => {
                            const cfg = COST_TYPE_CONFIG[item.costType];
                            const Icon = cfg.icon;
                            return (
                                <div
                                    key={item.id}
                                    className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-white hover:bg-muted/20 transition-colors"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <Badge variant="outline" className={`shrink-0 gap-1 text-xs ${cfg.color}`}>
                                            <Icon className="w-3 h-3" />
                                            {cfg.label}
                                        </Badge>
                                        <span className="text-sm text-muted-foreground truncate">
                                            {item.description || '—'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className="text-sm font-semibold tabular-nums">
                                            {formatRupiah(Number(item.amount))}
                                        </span>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="w-7 h-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                                            onClick={() => handleRemove(item.id)}
                                            disabled={isPending}
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}

                        <div className="flex justify-between items-center pt-3 border-t mt-3">
                            <span className="text-sm font-medium text-muted-foreground">Total Conversion Cost</span>
                            <span className="text-lg font-bold text-purple-700">
                                {formatRupiah(total)}
                            </span>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
