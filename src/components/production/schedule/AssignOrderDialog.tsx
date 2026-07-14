'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Calendar as CalendarIcon, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { id as localeID } from 'date-fns/locale';
import { cn } from '@/lib/utils/utils';
import { toast } from 'sonner';
import { updateProductionOrder } from '@/actions/production/production';
import { planningLabels } from '@/lib/labels/planning';
import type { OrderChip, Machine } from './MachineAllocationMatrix';

/* ---------- Props ---------- */
interface AssignOrderDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Pre-selected order (from queue "Tugaskan Mesin") */
    orderId?: string;
    /** Pre-selected machine+date (from cell "+" click) */
    machineId?: string;
    plannedStartDate?: Date;
    orders: OrderChip[];
    machines: Machine[];
}

/* ---------- Component ---------- */
export function AssignOrderDialog({
    open,
    onOpenChange,
    orderId: presetOrderId,
    machineId: presetMachineId,
    plannedStartDate: presetDate,
    orders,
    machines,
}: AssignOrderDialogProps) {
    const router = useRouter();
    const [selectedOrderId, setSelectedOrderId] = useState<string>(presetOrderId || '');
    const [selectedMachineId, setSelectedMachineId] = useState<string>(presetMachineId || '');
    const [date, setDate] = useState<Date | undefined>(presetDate || new Date());
    const [isPending, setIsPending] = useState(false);

    // Reset form when dialog opens with new presets
    const handleOpenChange = (nextOpen: boolean) => {
        if (nextOpen) {
            setSelectedOrderId(presetOrderId || '');
            setSelectedMachineId(presetMachineId || '');
            setDate(presetDate || new Date());
        }
        onOpenChange(nextOpen);
    };

    const handleSubmit = async () => {
        if (!selectedOrderId) {
            toast.error('Pilih order terlebih dahulu');
            return;
        }
        if (!selectedMachineId) {
            toast.error('Pilih mesin terlebih dahulu');
            return;
        }
        if (!date) {
            toast.error('Pilih tanggal terlebih dahulu');
            return;
        }

        setIsPending(true);
        try {
            await updateProductionOrder({
                id: selectedOrderId,
                machineId: selectedMachineId,
                plannedStartDate: date,
            });

            toast.success('Order berhasil ditugaskan ke mesin.');
            onOpenChange(false);
            router.refresh();
        } catch (err) {
            console.error(err);
            const message = err instanceof Error ? err.message : 'Gagal menugaskan order. Silakan coba lagi.';
            toast.error(message);
        } finally {
            setIsPending(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{planningLabels.assignOrder}</DialogTitle>
                    <DialogDescription>
                        {presetOrderId
                            ? planningLabels.selectMachineAndDate
                            : planningLabels.selectOrderToAssign
                        }
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    {/* Order selection (hidden when pre-selected from queue) */}
                    {!presetOrderId && (
                        <div className="grid gap-2">
                            <Label htmlFor="order">{planningLabels.chooseOrder}</Label>
                            <Select value={selectedOrderId} onValueChange={setSelectedOrderId}>
                                <SelectTrigger id="order">
                                    <SelectValue placeholder={planningLabels.chooseOrder} />
                                </SelectTrigger>
                                <SelectContent>
                                    {orders.map(order => (
                                        <SelectItem key={order.id} value={order.id}>
                                            {order.orderNumber} — {order.bomName}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {/* Machine selection (hidden when pre-selected from cell "+") */}
                    {!presetMachineId && (
                        <div className="grid gap-2">
                            <Label htmlFor="machine">Mesin</Label>
                            <Select value={selectedMachineId} onValueChange={setSelectedMachineId}>
                                <SelectTrigger id="machine">
                                    <SelectValue placeholder="Pilih mesin" />
                                </SelectTrigger>
                                <SelectContent>
                                    {machines.map(machine => (
                                        <SelectItem key={machine.id} value={machine.id}>
                                            {machine.code} - {machine.type}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {/* Date selection */}
                    <div className="grid gap-2">
                        <Label>Tanggal Mulai</Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    className={cn(
                                        "w-full justify-start text-left font-normal h-12",
                                        !date && "text-muted-foreground"
                                    )}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {date ? format(date, 'PPP', { locale: localeID }) : <span>Pilih tanggal</span>}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                                <Calendar
                                    mode="single"
                                    selected={date}
                                    onSelect={setDate}
                                    captionLayout="dropdown"
                                    fromYear={2000}
                                    toYear={new Date().getFullYear() + 1}
                                    initialFocus
                                />
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                        Batal
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={isPending || !selectedOrderId || !selectedMachineId || !date}
                    >
                        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {planningLabels.assignOrder}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
