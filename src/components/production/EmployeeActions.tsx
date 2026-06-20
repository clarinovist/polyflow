'use client';

import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { deleteEmployee } from '@/actions/admin/employees';
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

interface EmployeeActionsProps {
    id: string;
    name: string;
}

export function EmployeeActions({ id, name }: EmployeeActionsProps) {
    const [open, setOpen] = useState(false);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);

    async function handleDelete() {
        const result = await deleteEmployee(id);
        if (result.success) {
            toast.success('Data personel berhasil dihapus.', {
                description: `${name} telah dihapus dari direktori.`
            });
        } else {
            toast.error('Gagal menghapus', {
                description: result.error || 'Tidak dapat menghapus data personel. Pastikan data tersebut tidak terhubung ke order produksi aktif.'
            });
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
                    <Link href={`/dashboard/employees/${id}/edit`}>
                        <DropdownMenuItem>
                            <Pencil className="mr-2 h-4 w-4" />
                            {productionComponentLabels.editDetails}
                        </DropdownMenuItem>
                    </Link>
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
                            Ini akan menghapus permanen data staff <strong>{name}</strong>.
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
