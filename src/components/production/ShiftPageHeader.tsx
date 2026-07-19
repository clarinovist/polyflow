'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { ShiftDialog } from './ShiftDialog';

export function ShiftPageHeader() {
    const [open, setOpen] = useState(false);

    return (
        <>
            <Button onClick={() => setOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Add Shift
            </Button>
            <ShiftDialog open={open} onOpenChange={setOpen} />
        </>
    );
}
