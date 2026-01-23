"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Factory } from 'lucide-react';
import { ReassignMachineDialog } from '@/components/production/dispatch/ReassignMachineDialog';
import { Machine } from '@prisma/client';

export function ReassignMachineButton({ orderId, orderNumber, currentMachineId, machines }: { orderId: string; orderNumber: string; currentMachineId: string | null; machines: Machine[] }) {
    const [open, setOpen] = useState(false);

    return (
        <>
            <Button size="sm" variant="outline" onClick={() => setOpen(true)} className="text-xs">
                <Factory className="mr-2 h-4 w-4" /> Move Work Center
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
