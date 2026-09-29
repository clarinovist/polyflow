'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AssignOrderDialog } from './schedule/AssignOrderDialog';
import type { Machine, OrderChip } from './schedule/MachineAllocationMatrix';
import type { MachineStageMap } from '@/lib/production/machine-compatibility';

interface AssignJobButtonProps {
    machine: Machine;
    orders: OrderChip[];
    machineStageMap?: MachineStageMap | null;
}

/** Schedule work without starting production, using the same flow as the schedule. */
export function AssignJobButton({
    machine,
    orders,
    machineStageMap,
}: AssignJobButtonProps) {
    const [open, setOpen] = useState(false);
    const canAssign = machine.status === 'ACTIVE';

    return (
        <div className="space-y-2">
            <Button
                onClick={() => setOpen(true)}
                variant="outline"
                className="min-h-11 w-full"
                disabled={!canAssign}
                aria-label={`Tambah SPK ke ${machine.code}`}
            >
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                Tambah SPK
            </Button>
            <p className="text-xs text-muted-foreground">
                {canAssign
                    ? 'Alokasi jadwal saja, tidak otomatis memulai produksi.'
                    : 'Mesin harus aktif untuk menerima alokasi SPK.'}
            </p>
            {open && canAssign && (
                <AssignOrderDialog
                    open={open}
                    onOpenChange={setOpen}
                    machineId={machine.id}
                    machines={[machine]}
                    orders={orders.filter((order) => order.machineId !== machine.id)}
                    machineStageMap={machineStageMap}
                />
            )}
        </div>
    );
}
