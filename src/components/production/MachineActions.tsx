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
import { deleteMachine, setMachineStatus } from '@/actions/production/machines';
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
import { productionComponentLabels } from '@/lib/labels';

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
            toast.success('Mesin berhasil dihapus.');
        } else {
            toast.error('Gagal menghapus mesin', { description: result.error });
        }
    }

    async function handleSetMaintenance() {
        const res = await setMachineStatus(id, 'MAINTENANCE');
        if (res.success) {
            toast.success('Status mesin diubah ke MAINTENANCE.');
        } else {
            toast.error('Gagal memperbarui status', { description: res.error });
        }
    }

    async function handleStart() {
        const res = await setMachineStatus(id, 'ACTIVE');
        if (res.success) {
            toast.success('Status mesin diubah ke ACTIVE.');
        } else {
            toast.error('Gagal memperbarui status', { description: res.error });
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
                    <DropdownMenuLabel>{productionComponentLabels.actions}</DropdownMenuLabel>
                    <Link href={`/dashboard/machines/${id}/edit`}>
                        <DropdownMenuItem>
                            <Pencil className="mr-2 h-4 w-4" />
                            {productionComponentLabels.editDetails}
                        </DropdownMenuItem>
                    </Link>
                    <DropdownMenuItem onClick={handleStart}>
                        <Loader2 className="mr-2 h-4 w-4" />
                        {productionComponentLabels.setActive}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleSetMaintenance}>
                        <AlertCircle className="mr-2 h-4 w-4" />
                        {productionComponentLabels.setMaintenance}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onClick={() => setShowDeleteDialog(true)}
                        className="text-destructive focus:text-destructive focus:bg-destructive/10"
                    >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {productionComponentLabels.delete}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Apakah Anda benar-benar yakin?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Ini akan menghapus permanen mesin <strong>{name}</strong>.
                            Tindakan ini tidak dapat dibatalkan.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Batal</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Hapus
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
