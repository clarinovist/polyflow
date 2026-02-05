"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Factory } from 'lucide-react';
import { ReassignMachineDialog } from '@/components/production/dispatch/ReassignMachineDialog';

export function ReassignMachineButton({ orderId, orderNumber, currentMachineId, machines }: { orderId: string; orderNumber: string; currentMachineId: string | null; machines: { id: string; name: string; code: string }[] }) {
    const [open, setOpen] = useState(false);
    if (currentMachineId) {
        return (
            <>
                <Button size="icon" variant="ghost" onClick={() => setOpen(true)} className="h-6 w-6 text-muted-foreground hover:text-foreground" title="Change Machine">
                    <Factory className="h-3 w-3" />
                </Button>
                <ReassignMachineDialog
                    open={open}
                    onOpenChange={setOpen}
                    orderId={orderId}
                    orderNumber={orderNumber}
                    currentMachineId={currentMachineId}
                    machines={machines}
                />
            </>
        );
    }

    return (
        <>
            <Button size="sm" variant="outline" onClick={() => setOpen(true)} className="h-7 text-xs px-2 bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 hover:text-blue-800 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-900">
                <Factory className="mr-2 h-3 w-3" /> Assign Machine
            </Button>
            <ReassignMachineDialog
                open={open}
                onOpenChange={setOpen}
                orderId={orderId}
                orderNumber={orderNumber}
                currentMachineId={currentMachineId}
                machines={machines}
            />
        </>
    );
}

export default ReassignMachineButton;
