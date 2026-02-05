'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { updateProductionOrder } from '@/actions/production';
import { toast } from 'sonner';

interface AssignJobButtonProps {
    machineId: string;
    machineCode: string;
    releasedOrders: {
        id: string;
        orderNumber: string;
        bom: {
            productVariant: {
                name: string;
            }
        };
        machine?: {
            id: string;
            code: string;
        } | null;
    }[];
}

export function AssignJobButton({ machineId, machineCode, releasedOrders }: AssignJobButtonProps) {
    const [open, setOpen] = useState(false);
    const [selectedOrderId, setSelectedOrderId] = useState('');
    const [isPending, setIsPending] = useState(false);

    const handleAssign = async () => {
        if (!selectedOrderId) {
            toast.error('Please select an order');
            return;
        }

        setIsPending(true);
        try {
            const result = await updateProductionOrder({
                id: selectedOrderId,
                machineId: machineId,
                status: 'IN_PROGRESS' // Auto-start the job when assigned from machine board? Or keep as RELEASED?
                // Usually assigning to machine starts the "prep" phase.
            });

            if (result.success) {
                toast.success('Job assigned to machine');
                setOpen(false);
            } else {
                toast.error(result.error || 'Failed to assign job');
            }
        } catch (err) {
            console.error(err);
            toast.error('An error occurred');
        } finally {
            setIsPending(false);
        }
    };

    return (
        <>
            <Button
                onClick={() => setOpen(true)}
                variant="outline"
                size="sm"
                className="mt-4 h-8 text-[10px] font-black uppercase tracking-widest border-emerald-500/50 text-emerald-600 hover:bg-emerald-50 bg-emerald-50/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/20"
            >
                <Plus className="mr-1.5 h-3 w-3" /> Assign Job
            </Button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Assign Job to {machineCode}</DialogTitle>
                        <DialogDescription>
                            Select a released work order to begin production on this station.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="py-4">
                        <Label>Released Orders</Label>
                        <Select value={selectedOrderId} onValueChange={setSelectedOrderId}>
                            <SelectTrigger className="mt-2">
                                <SelectValue placeholder="Select an order..." />
                            </SelectTrigger>
                            <SelectContent>
                                {releasedOrders.length === 0 ? (
                                    <div className="p-4 text-center text-xs text-muted-foreground">
                                        No released orders available.
                                    </div>
                                ) : (
                                    releasedOrders.map((order) => {
                                        const isPlannedForThis = order.machine?.id === machineId;
                                        const otherMachineCode = !isPlannedForThis && order.machine ? order.machine.code : null;

                                        return (
                                            <SelectItem key={order.id} value={order.id}>
                                                <div className="flex flex-col py-0.5">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold">{order.orderNumber}</span>
                                                        {isPlannedForThis && (
                                                            <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 rounded font-black uppercase tracking-tighter">Planned for here</span>
                                                        )}
                                                        {otherMachineCode && (
                                                            <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 rounded font-black uppercase tracking-tighter">Planned for {otherMachineCode}</span>
                                                        )}
                                                    </div>
                                                    <span className="text-[10px] text-muted-foreground truncate">{order.bom.productVariant.name}</span>
                                                </div>
                                            </SelectItem>
                                        );
                                    })
                                )}
                            </SelectContent>
                        </Select>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>Cancel</Button>
                        <Button onClick={handleAssign} disabled={isPending || !selectedOrderId}>
                            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Confirm Assignment
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
