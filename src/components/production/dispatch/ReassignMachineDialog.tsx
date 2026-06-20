'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { updateProductionOrder } from '@/actions/production/production';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { productionComponentLabels } from '@/lib/labels';

interface ReassignMachineDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    orderId: string;
    orderNumber: string;
    currentMachineId: string | null;
    machines: { id: string; name: string; code: string }[];
}

export function ReassignMachineDialog({
    open,
    onOpenChange,
    orderId,
    orderNumber,
    currentMachineId,
    machines
}: ReassignMachineDialogProps) {
    const [selectedMachineId, setSelectedMachineId] = useState<string>(currentMachineId || '');
    const [isPending, setIsPending] = useState(false);

    const handleReassign = async () => {
        if (!selectedMachineId) {
            toast.error('Pilih mesin terlebih dahulu');
            return;
        }

        setIsPending(true);
        try {
            const result = await updateProductionOrder({
                id: orderId,
                machineId: selectedMachineId
            });

            if (result.success) {
                toast.success('Mesin berhasil dipindahkan.');
                onOpenChange(false);
            } else {
                toast.error(result.error || 'Gagal memindahkan mesin');
            }
        } catch (err) {
            console.error(err);
            toast.error('Terjadi kesalahan saat memindahkan mesin');
        } finally {
            setIsPending(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{productionComponentLabels.reassignMachine}</DialogTitle>
                    <DialogDescription>
                        Reassign order <span className="font-bold text-foreground">{orderNumber}</span> to a different machine.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="machine">{productionComponentLabels.selectMachineUpdatesOrder}</Label>
                        <Select
                            value={selectedMachineId}
                            onValueChange={setSelectedMachineId}
                        >
                            <SelectTrigger id="machine">
                                <SelectValue placeholder={productionComponentLabels.chooseMachine} />
                            </SelectTrigger>
                            <SelectContent>
                                {machines.map((machine) => (
                                    <SelectItem key={machine.id} value={machine.id}>
                                        {machine.code} - {machine.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                        {productionComponentLabels.cancel}
                    </Button>
                    <Button onClick={handleReassign} disabled={isPending || !selectedMachineId}>
                        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {productionComponentLabels.reassign}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
