'use client';

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, Save } from 'lucide-react';
import { toast } from 'sonner';
import { saveOpnameCount } from '@/actions/opname';

interface OpnameCounterProps {
    session: any;
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

        session.items.forEach((item: any) => {
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

            // Include items that might have notes but no count update? 
            // Better to iterate all modified items if we tracked dirty state per item.
            // For now, let's just send everything in `counts` as that's safer.

            const result = await saveOpnameCount(session.id, updates);

            if (result.success) {
                toast.success("Counts saved successfully");
                setHasChanges(false);
            } else {
                toast.error(`Error: ${result.error}`);
            }
        } catch (error) {
            toast.error("Failed to save counts");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between bg-slate-50 p-4 rounded-lg border">
                <div className="flex items-center space-x-2">
                    <Switch id="blind-mode" checked={blindMode} onCheckedChange={setBlindMode} />
                    <Label htmlFor="blind-mode" className="flex items-center gap-2 cursor-pointer">
                        {blindMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        Blind Mode <span className="text-xs text-slate-500 font-normal">(Hide system quantity)</span>
                    </Label>
                </div>

                {!isReadOnly && (
                    <Button onClick={handleSave} disabled={!hasChanges || isSaving}>
                        <Save className="mr-2 h-4 w-4" />
                        {isSaving ? "Saving..." : "Save Progress"}
                    </Button>
                )}
            </div>

            <div className="border rounded-md">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[300px]">Product</TableHead>
                            <TableHead>SKU</TableHead>
                            <TableHead>Unit</TableHead>
                            <TableHead className="text-right">
                                {blindMode ? "System Qty" : "System Qty (Snapshot)"}
                            </TableHead>
                            <TableHead className="w-[150px] text-right">Physical Count</TableHead>
                            <TableHead>Notes</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {session.items.map((item: any) => (
                            <TableRow key={item.id}>
                                <TableCell className="font-medium">
                                    {item.productVariant.name}
                                    <div className="text-xs text-slate-500">
                                        {item.productVariant.product.name}
                                    </div>
                                </TableCell>
                                <TableCell>{item.productVariant.skuCode}</TableCell>
                                <TableCell>{item.productVariant.primaryUnit}</TableCell>
                                <TableCell className="text-right text-slate-500">
                                    {blindMode ? '***' : Number(item.systemQuantity).toLocaleString()}
                                </TableCell>
                                <TableCell className="text-right">
                                    <Input
                                        type="number"
                                        className="text-right"
                                        placeholder="0"
                                        value={counts[item.id] || ''}
                                        onChange={(e) => handleCountChange(item.id, e.target.value)}
                                        disabled={isReadOnly}
                                    />
                                </TableCell>
                                <TableCell>
                                    <Input
                                        placeholder="Optional notes"
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
        </div>
    );
}
