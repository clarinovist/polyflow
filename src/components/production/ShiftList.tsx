'use client';

import { useState } from 'react';
import { WorkShift } from '@prisma/client';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Edit, Trash2 } from 'lucide-react';
import { deleteWorkShift } from '@/actions/admin/work-shifts';
import { toast } from 'sonner';
import { ShiftDialog } from './ShiftDialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from '@/components/ui/alert-dialog';

interface ShiftListProps {
    shifts: WorkShift[];
}

export function ShiftList({ shifts }: ShiftListProps) {
    const [editingShift, setEditingShift] = useState<WorkShift | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);

    const handleEdit = (shift: WorkShift) => {
        setEditingShift(shift);
        setDialogOpen(true);
    };

    const [deletingShift, setDeletingShift] = useState<WorkShift | null>(null);
    const [deleting, setDeleting] = useState(false);
    const handleDelete = async () => {
        if (!deletingShift || deleting) return;
        setDeleting(true);
        try {
            const result = await deleteWorkShift(deletingShift.id);
            if (result.success) {
                toast.success('Shift berhasil dihapus.');
                setDeletingShift(null);
            } else {
                toast.error(result.error || 'Gagal menghapus shift');
            }
        } catch {
            toast.error('Gagal menghapus shift. Coba lagi.');
        } finally {
            setDeleting(false);
        }
    };

    return (
        <>
            <Table>
                <TableHeader className="bg-muted/50">
                    <TableRow>
                        <TableHead className="font-semibold text-muted-foreground">
                            Nama
                        </TableHead>
                        <TableHead className="font-semibold text-muted-foreground">
                            Jam Mulai
                        </TableHead>
                        <TableHead className="font-semibold text-muted-foreground">
                            Jam Selesai
                        </TableHead>
                        <TableHead className="font-semibold text-muted-foreground">
                            Jam Rencana
                        </TableHead>
                        <TableHead className="font-semibold text-muted-foreground">
                            Status
                        </TableHead>
                        <TableHead className="text-right font-semibold text-muted-foreground">
                            Aksi
                        </TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {shifts.length === 0 ? (
                        <TableRow>
                            <TableCell
                                colSpan={6}
                                className="h-48 text-center text-muted-foreground"
                            >
                                <div className="flex flex-col items-center justify-center gap-2">
                                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-2">
                                        <Edit className="h-5 w-5 text-muted-foreground" />
                                    </div>
                                    <p className="text-base font-medium text-foreground">
                                        Tidak ada shift ditemukan
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        Tambahkan shift baru untuk menentukan
                                        jam kerja.
                                    </p>
                                </div>
                            </TableCell>
                        </TableRow>
                    ) : (
                        shifts.map((shift) => (
                            <TableRow
                                key={shift.id}
                                className="hover:bg-muted/50"
                            >
                                <TableCell className="font-medium text-foreground">
                                    {shift.name}
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                    {shift.startTime}
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                    {shift.endTime}
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                    {shift.plannedHours != null
                                        ? `${shift.plannedHours}j`
                                        : '-'}
                                </TableCell>
                                <TableCell>
                                    <Badge
                                        variant={
                                            shift.status === 'ACTIVE'
                                                ? 'default'
                                                : 'secondary'
                                        }
                                        className={
                                            shift.status === 'ACTIVE'
                                                ? 'bg-green-500/10 text-green-600 hover:bg-green-500/20'
                                                : 'bg-muted text-muted-foreground'
                                        }
                                    >
                                        {shift.status === 'ACTIVE' ? 'Aktif' : 'Nonaktif'}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                    <div className="flex justify-end gap-2">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-11 w-11 text-muted-foreground hover:text-primary"
                                            aria-label={`Ubah shift ${shift.name}`}
                                            onClick={() => handleEdit(shift)}
                                        >
                                            <Edit className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-11 w-11 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                            aria-label={`Hapus shift ${shift.name}`}
                                            onClick={() =>
                                                setDeletingShift(shift)
                                            }
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>

            <AlertDialog open={!!deletingShift} onOpenChange={(open) => { if (!open && !deleting) setDeletingShift(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>Hapus shift?</AlertDialogTitle><AlertDialogDescription>Hapus {deletingShift?.name}. Shift yang masih digunakan tetap mengikuti validasi server.</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel disabled={deleting}>Batal</AlertDialogCancel><Button variant="destructive" disabled={deleting} onClick={handleDelete}>{deleting ? 'Menghapus…' : 'Hapus Shift'}</Button></AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            <ShiftDialog
                open={dialogOpen}
                onOpenChange={(open) => {
                    setDialogOpen(open);
                    if (!open) setEditingShift(null);
                }}
                shiftToEdit={editingShift}
            />
        </>
    );
}
