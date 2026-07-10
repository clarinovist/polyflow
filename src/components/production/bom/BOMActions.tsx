'use client';

import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Pencil, Trash2, Eye, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { deleteBom, recalculateBomCostChain } from '@/actions/production/boms';
import { toast } from 'sonner';
import { useState } from 'react';
import { useBomBasePath } from './useBomBasePath';
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

interface BOMActionsProps {
    id: string;
    name: string;
}

export function BOMActions({ id, name }: BOMActionsProps) {
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isRecalculating, setIsRecalculating] = useState(false);
    const basePath = useBomBasePath();

    async function handleDelete() {
        setIsDeleting(true);
        try {
            const result = await deleteBom(id);
            if (result.success) {
                toast.success('Recipe berhasil dihapus.');
            } else {
                toast.error('Gagal menghapus resep', { description: result.error });
            }
        } catch (_error) {
            toast.error('Gagal memproses BOM. Silakan coba lagi.');
        } finally {
            setIsDeleting(false);
            setShowDeleteDialog(false);
        }
    }

    async function handleRecalculateChain() {
        setIsRecalculating(true);
        try {
            const result = await recalculateBomCostChain(id);
            if (result.success) {
                const parentCount = result.data?.updatedParentCount || 0;
                toast.success('Cost chain berhasil dihitung ulang.', {
                    description: `${name}: ${parentCount} BOM induk diperbarui`,
                });
            } else {
                toast.error('Gagal menghitung ulang cost chain', { description: result.error });
            }
        } catch (_error) {
            toast.error('Gagal memproses BOM. Silakan coba lagi.');
        } finally {
            setIsRecalculating(false);
        }
    }

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary">
                        <span className="sr-only">Buka menu aksi</span>
                        <MoreHorizontal className="h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Aksi</DropdownMenuLabel>
                    <Link href={`${basePath}/${id}/edit`}>
                        <DropdownMenuItem>
                            <Pencil className="mr-2 h-4 w-4" />
                            Ubah Formula
                        </DropdownMenuItem>
                    </Link>
                    <Link href={`${basePath}/${id}`}>
                        <DropdownMenuItem>
                            <Eye className="mr-2 h-4 w-4" />
                            Lihat Detail
                        </DropdownMenuItem>
                    </Link>
                    <DropdownMenuItem onClick={handleRecalculateChain} disabled={isRecalculating}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        {isRecalculating ? 'Menghitung ulang...' : 'Hitung Ulang Rantai Biaya'}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onClick={() => setShowDeleteDialog(true)}
                        className="text-destructive focus:text-destructive focus:bg-destructive/10"
                    >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Hapus Resep
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Apakah Anda benar-benar yakin?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Ini akan menghapus permanen resep <strong>{name}</strong>.
                            Tindakan ini tidak dapat dibatalkan dan dapat memengaruhi perencanaan produksi aktif.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Batal</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => {
                                e.preventDefault();
                                handleDelete();
                            }}
                            disabled={isDeleting}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {isDeleting ? 'Menghapus...' : 'Hapus Resep'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
