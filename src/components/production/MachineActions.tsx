'use client';

import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Pencil, Trash2, AlertCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { deleteMachine, setMachineStatus } from '@/actions/machines';
import { toast } from 'sonner';
import { useState } from 'react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface MachineActionsProps {
    id: string;
    name: string;
}

export function MachineActions({ id, name }: MachineActionsProps) {
    const [open, setOpen] = useState(false);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);

    async function handleDelete() {
        const result = await deleteMachine(id);
        if (result.success) {
            toast.success('Machine deleted successfully');
        } else {
            toast.error('Failed to delete machine', { description: result.error });
        }
    }

    async function handleSetMaintenance() {
        const res = await setMachineStatus(id, 'MAINTENANCE');
        if (res.success) {
            toast.success('Machine set to MAINTENANCE');
        } else {
            toast.error('Failed to update status', { description: res.error });
        }
    }

    async function handleStart() {
        const res = await setMachineStatus(id, 'ACTIVE');
        if (res.success) {
            toast.success('Machine set to ACTIVE');
        } else {
            toast.error('Failed to update status', { description: res.error });
        }
    }

    return (
        <>
            <DropdownMenu open={open} onOpenChange={setOpen}>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm">
                        <MoreHorizontal className="h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                    <Link href={`/dashboard/machines/${id}/edit`}>
                        <DropdownMenuItem>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit Details
                        </DropdownMenuItem>
                    </Link>
                    <DropdownMenuItem onClick={handleStart}>
                        <Loader2 className="mr-2 h-4 w-4" />
                        Set Active
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleSetMaintenance}>
                        <AlertCircle className="mr-2 h-4 w-4" />
                        Set Maintenance
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onClick={() => setShowDeleteDialog(true)}
                        className="text-destructive focus:text-destructive focus:bg-destructive/10"
                    >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete the machine <strong>{name}</strong>.
                            This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
