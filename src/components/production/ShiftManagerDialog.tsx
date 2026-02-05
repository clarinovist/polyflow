'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Users } from 'lucide-react';
import { ShiftManager } from './ShiftManager';

interface ShiftManagerDialogProps {
    orderId: string;
    orderNumber: string;
    shifts: {
        id: string;
        shiftName: string;
        startTime: Date | string;
        endTime: Date | string;
        operator: { id: string; name: string | null; code: string } | null;
        helpers: { id: string; name: string | null; code: string }[];
    }[];
    operators: { id: string; name: string | null; code: string }[];
    helpers: { id: string; name: string | null; code: string }[];
    workShifts: { id: string; name: string; startTime: string; endTime: string; status: string }[];
    machines: { id: string; name: string; code: string }[];
}

export function ShiftManagerDialog({
    orderId,
    orderNumber,
    shifts,
    operators,
    helpers,
    workShifts,
    machines
}: ShiftManagerDialogProps) {
    const [open, setOpen] = useState(false);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="w-full text-[10px] font-black uppercase h-8 border-zinc-200 dark:border-zinc-800 hover:border-emerald-500/50 transition-colors">
                    <Users className="mr-1.5 h-3 w-3" /> Shift
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        Shift Management: {orderNumber}
                    </DialogTitle>
                </DialogHeader>
                <div className="py-4">
                    <ShiftManager
                        orderId={orderId}
                        shifts={shifts}
                        operators={operators}
                        helpers={helpers}
                        workShifts={workShifts}
                        machines={machines}
                    />
                </div>
            </DialogContent>
        </Dialog>
    );
}
