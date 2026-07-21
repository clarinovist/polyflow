'use client';

import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Pencil, Trash2, Banknote, FileText, User } from 'lucide-react';
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

interface EmployeeActionsProps {
    id: string;
    name: string;
    payType?: 'DAILY' | 'PIECE' | 'MONTHLY';
}

export function EmployeeActions({ id, name, payType }: EmployeeActionsProps) {
    const [open, setOpen] = useState(false);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);

    async function handleDelete() {
        const result = await deleteEmployee(id);
        if (result.success) {
            toast.success('Karyawan berhasil dihapus.', {
                description: `${name} telah dihapus dari direktori.`
            });
        } else {
            toast.error('Gagal menghapus', {
                description: result.error || 'Tidak dapat menghapus data karyawan. Pastikan data tersebut tidak terhubung ke order produksi aktif.'
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
                    <DropdownMenuLabel>Aksi</DropdownMenuLabel>
                    <Link href={`/dashboard/employees/${id}`}>
                        <DropdownMenuItem>
                            <User className="mr-2 h-4 w-4" />
                            Profil
                        </DropdownMenuItem>
                    </Link>
                    <Link href={`/dashboard/employees/${id}/edit`}>
                        <DropdownMenuItem>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                        </DropdownMenuItem>
                    </Link>
                    {(payType === 'DAILY' || payType === 'PIECE') && (
                        <Link href={`/dashboard/employees/${id}/payroll`}>
                            <DropdownMenuItem>
                                <Banknote className="mr-2 h-4 w-4" />
                                Gaji mingguan
                            </DropdownMenuItem>
                        </Link>
                    )}
                    {payType === 'MONTHLY' && (
                        <Link href="/hrd/payroll-monthly">
                            <DropdownMenuItem>
                                <FileText className="mr-2 h-4 w-4" />
                                Lihat gaji bulanan
                            </DropdownMenuItem>
                        </Link>
                    )}
                    <DropdownMenuItem
                        onClick={() => setShowDeleteDialog(true)}
                        className="text-destructive focus:text-destructive focus:bg-destructive/10"
                    >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Hapus
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Hapus karyawan?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Ini akan menghapus permanen data karyawan <strong>{name}</strong>.
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
