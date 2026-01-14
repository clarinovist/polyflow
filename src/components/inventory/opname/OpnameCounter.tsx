'use client';

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { saveOpnameCount } from '@/actions/opname';

interface OpnameItem {
    id: string;
    countedQuantity: number | null;
    systemQuantity: number;
    notes: string | null;
    productVariant: {
        name: string;
        skuCode: string;
        primaryUnit: string;
        product: {
            name: string;
        };
    };
}

interface OpnameSession {
    id: string;
    items: OpnameItem[];
}

interface OpnameCounterProps {
    session: OpnameSession;
    isReadOnly: boolean;
}

export function OpnameCounter({ session, isReadOnly }: OpnameCounterProps) {
    const [counts, setCounts] = useState<Record<string, string>>({});
    const [notes, setNotes] = useState<Record<string, string>>({});
    const [blindMode, setBlindMode] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);

    // Initialize state from props
    useEffect(() => {
        const initialCounts: Record<string, string> = {};
        const initialNotes: Record<string, string> = {};

        session.items.forEach((item) => {
            if (item.countedQuantity !== null) {
                initialCounts[item.id] = item.countedQuantity.toString();
            }
            if (item.notes) {
                initialNotes[item.id] = item.notes;
            }
        });

        setCounts(initialCounts);
        setNotes(initialNotes);
    }, [session]);

    const handleCountChange = (id: string, value: string) => {
        setCounts(prev => ({ ...prev, [id]: value }));
        setHasChanges(true);
    };

    const handleNoteChange = (id: string, value: string) => {
        setNotes(prev => ({ ...prev, [id]: value }));
        setHasChanges(true);
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            // Convert state to array for server action
            const updates = Object.keys(counts).map(id => ({
                id,
                countedQuantity: parseFloat(counts[id] || '0'),
                notes: notes[id]
            }));

            const result = await saveOpnameCount(session.id, updates);

            if (result.success) {
                toast.success("Counts saved successfully");
                setHasChanges(false);
            } else {
                toast.error(`Error: ${result.error}`);
            }
        } catch {
            toast.error("Failed to save counts");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-4 relative">
            <div className="flex items-center justify-between bg-muted/40 p-4 rounded-lg border border-border/50">
                <div className="flex items-center space-x-3">
                    <Switch id="blind-mode" checked={blindMode} onCheckedChange={setBlindMode} />
                    <Label htmlFor="blind-mode" className="flex items-center gap-2 cursor-pointer select-none">
                        {blindMode ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-primary" />}
                        <div className="flex flex-col">
                            <span className="font-medium">Blind Mode</span>
                            <span className="text-[10px] text-muted-foreground font-normal">Hide system quantities to ensure unbiased counting</span>
                        </div>
                    </Label>
                </div>
            </div>

            <div className="border border-border/50 rounded-lg overflow-hidden">
                <Table>
                    <TableHeader className="bg-muted/30">
                        <TableRow className="hover:bg-transparent">
                            <TableHead className="w-[300px]">Product</TableHead>
                            <TableHead>SKU</TableHead>
                            <TableHead>Unit</TableHead>
                            <TableHead className="text-right">
                                {blindMode ? "System Qty" : "System Qty (Snapshot)"}
                            </TableHead>
                            <TableHead className="w-[180px] text-right">Physical Count</TableHead>
                            <TableHead className="w-[200px]">Notes</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {session.items.map((item) => (
                            <TableRow key={item.id} className="hover:bg-muted/20">
                                <TableCell className="font-medium">
                                    <div className="flex flex-col">
                                        <span>{item.productVariant.name}</span>
                                        <span className="text-xs text-muted-foreground font-normal">
                                            {item.productVariant.product.name}
                                        </span>
                                    </div>
                                </TableCell>
                                <TableCell className="text-muted-foreground text-xs font-mono">{item.productVariant.skuCode}</TableCell>
                                <TableCell className="text-xs">{item.productVariant.primaryUnit}</TableCell>
                                <TableCell className="text-right text-muted-foreground font-mono">
                                    {blindMode ? (
                                        <span className="opacity-20 select-none">••••</span>
                                    ) : (
                                        Number(item.systemQuantity).toLocaleString()
                                    )}
                                </TableCell>
                                <TableCell className="text-right">
                                    <Input
                                        type="number"
                                        className="text-right h-9 font-mono"
                                        placeholder="0"
                                        value={counts[item.id] || ''}
                                        onChange={(e) => handleCountChange(item.id, e.target.value)}
                                        disabled={isReadOnly}
                                    />
                                </TableCell>
                                <TableCell>
                                    <Input
                                        placeholder="Optional..."
                                        className="h-9 text-xs"
                                        value={notes[item.id] || ''}
                                        onChange={(e) => handleNoteChange(item.id, e.target.value)}
                                        disabled={isReadOnly}
                                    />
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            {/* Sticky Save Action */}
            {!isReadOnly && (
                <div className={`sticky bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-md border-t border-border mt-6 flex justify-end transition-all ${hasChanges ? 'opacity-100 translate-y-0' : 'opacity-50 translate-y-10 pointer-events-none'}`}>
                    <Button
                        onClick={handleSave}
                        disabled={!hasChanges || isSaving}
                        className="shadow-lg shadow-primary/20"
                    >
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        {isSaving ? "Saving Progress..." : "Save Progress"}
                    </Button>
                </div>
            )}
        </div>
    );
}
