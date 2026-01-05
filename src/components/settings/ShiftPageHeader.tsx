'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { ShiftDialog } from './ShiftDialog';

export function ShiftPageHeader() {
    const [open, setOpen] = useState(false);

    return (
        <div className="flex justify-between items-center">
            <div className="flex flex-col gap-1">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Shift Management</h2>
                    <p className="text-muted-foreground">
                        Manage work shifts and their durations.
                    </p>
                </div>
            </div>
            <Button onClick={() => setOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Add Shift
            </Button>
            <ShiftDialog open={open} onOpenChange={setOpen} />
        </div>
    );
}
