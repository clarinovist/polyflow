'use client';

import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Pencil, Trash2, Eye, RefreshCw, Copy, Archive, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { deleteBom, archiveBom, reactivateBom, recalculateBomCostChain } from '@/actions/production/boms';
import { toast } from 'sonner';
import { useState } from 'react';
import { useBomBasePath } from './useBomBasePath';
import { DuplicateBomDialog } from './DuplicateBomDialog';
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

interface BOMActionsProps {
    id: string;
    name: string;
    isActive: boolean;
    isDefault: boolean;
    usageCount: number;
    productVariantId?: string;
    productVariantName?: string;
    outputQuantity?: number;
    itemCount?: number;
    category?: string;
    /** Active BOMs from same variant for default replacement */
    activeBomOptions?: Array<{ id: string; name: string; isDefault?: boolean }>;
}

export function BOMActions({
    id, name, isActive, isDefault, usageCount,
    productVariantId, productVariantName, outputQuantity, itemCount, category,
    activeBomOptions = [],
}: BOMActionsProps) {
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [showArchiveDialog, setShowArchiveDialog] = useState(false);
    const [showReactivateDialog, setShowReactivateDialog] = useState(false);
    const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isArchiving, setIsArchiving] = useState(false);
    const [isReactivating, setIsReactivating] = useState(false);
    const [isRecalculating, setIsRecalculating] = useState(false);
    const [newDefaultBomId, setNewDefaultBomId] = useState<string>('');
    const basePath = useBomBasePath();

    // Decision: show delete or archive based on usage
    const canHardDelete = isActive && usageCount === 0;
    const canArchive = isActive && usageCount > 0;
    // Also allow hard delete for archived unused (optional per plan Q3)
    const canDeleteArchived = !isActive && usageCount === 0;

    async function handleDelete() {
        setIsDeleting(true);
        try {
            const result = await deleteBom(id);
            if (result.success) {
                toast.success('Resep berhasil dihapus permanen.');
            } else {
                toast.error('Gagal menghapus resep', { description: result.error });
            }
        } catch (_error) {
            toast.error('Gagal memproses. Silakan coba lagi.');
        } finally {
            setIsDeleting(false);
            setShowDeleteDialog(false);
        }
    }

    async function handleArchive() {
        if (isDefault && !newDefaultBomId) {
            toast.error('Pilih resep pengganti sebagai default terlebih dahulu.');
            return;
        }
        setIsArchiving(true);
        try {
            const result = await archiveBom({
                bomId: id,
                newDefaultBomId: isDefault ? newDefaultBomId : undefined,
            });
            if (result.success) {
                toast.success('Resep berhasil dinonaktifkan.');
            } else {
                toast.error('Gagal menonaktifkan resep', { description: result.error });
            }
        } catch (_error) {
            toast.error('Gagal memproses. Silakan coba lagi.');
        } finally {
            setIsArchiving(false);
            setShowArchiveDialog(false);
            setNewDefaultBomId('');
        }
    }

    async function handleReactivate() {
        setIsReactivating(true);
        try {
            const result = await reactivateBom(id);
            if (result.success) {
                toast.success('Resep berhasil diaktifkan kembali.');
            } else {
                toast.error('Gagal mengaktifkan resep', { description: result.error });
            }
        } catch (_error) {
            toast.error('Gagal memproses. Silakan coba lagi.');
        } finally {
            setIsReactivating(false);
            setShowReactivateDialog(false);
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
                    {productVariantId && (itemCount ?? 0) > 0 && (
                        <DropdownMenuItem onClick={() => setShowDuplicateDialog(true)}>
                            <Copy className="mr-2 h-4 w-4" />
                            Duplikat Formula
                        </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={handleRecalculateChain} disabled={isRecalculating}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        {isRecalculating ? 'Menghitung ulang...' : 'Hitung Ulang Rantai Biaya'}
                    </DropdownMenuItem>

                    {/* Active + not used → Hapus permanen */}
                    {canHardDelete && (
                        <DropdownMenuItem
                            onClick={() => setShowDeleteDialog(true)}
                            className="text-destructive focus:text-destructive focus:bg-destructive/10"
                        >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Hapus permanen
                        </DropdownMenuItem>
                    )}

                    {/* Active + in use → Nonaktifkan */}
                    {canArchive && (
                        <DropdownMenuItem
                            onClick={() => setShowArchiveDialog(true)}
                            className="text-orange-600 focus:text-orange-600 focus:bg-orange-50 dark:text-orange-400"
                        >
                            <Archive className="mr-2 h-4 w-4" />
                            Nonaktifkan
                        </DropdownMenuItem>
                    )}

                    {/* Archived + not used → also allow hard delete */}
                    {canDeleteArchived && (
                        <DropdownMenuItem
                            onClick={() => setShowDeleteDialog(true)}
                            className="text-destructive focus:text-destructive focus:bg-destructive/10"
                        >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Hapus permanen
                        </DropdownMenuItem>
                    )}

                    {/* Archived → Aktifkan lagi */}
                    {!isActive && (
                        <DropdownMenuItem
                            onClick={() => setShowReactivateDialog(true)}
                            className="text-green-600 focus:text-green-600 focus:bg-green-50 dark:text-green-400"
                        >
                            <RotateCcw className="mr-2 h-4 w-4" />
                            Aktifkan lagi
                        </DropdownMenuItem>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>

            {/* Delete Dialog */}
            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Hapus resep permanen?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Tindakan ini tidak dapat dibatalkan. Resep <strong>{name}</strong> akan
                            dihapus permanen dari sistem. Hanya bisa dilakukan untuk resep yang belum
                            pernah dipakai di Production Order.
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
                            {isDeleting ? 'Menghapus...' : 'Hapus Permanen'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Archive Dialog */}
            <AlertDialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Nonaktifkan resep?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Resep <strong>{name}</strong> akan hilang dari daftar produksi baru.
                            History Work Order lama tetap aman.
                            {usageCount > 0 && (
                                <> Resep ini sudah dipakai di <strong>{usageCount} Work Order</strong>.</>
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>

                    {/* If default, show replacement selector */}
                    {isDefault && (
                        <div className="px-6 pb-2">
                            <label className="text-sm font-medium text-muted-foreground mb-2 block">
                                Pilih resep aktif lain sebagai default:
                            </label>
                            {activeBomOptions.length === 0 ? (
                                <p className="text-sm text-destructive">
                                    Tidak ada resep aktif lain di produk ini. Buat/duplikat resep pengganti dulu, atau jadikan resep lain sebagai default sebelum menonaktifkan.
                                </p>
                            ) : (
                                <Select value={newDefaultBomId} onValueChange={setNewDefaultBomId}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Pilih resep pengganti..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {activeBomOptions.map((opt) => (
                                            <SelectItem key={opt.id} value={opt.id}>
                                                {opt.name}
                                                {opt.isDefault ? ' (default saat ini)' : ''}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                            <p className="text-[11px] text-muted-foreground mt-1">
                                Resep ini adalah default untuk produk ini. Wajib pilih pengganti sebelum nonaktifkan.
                            </p>
                        </div>
                    )}

                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isArchiving}>Batal</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => {
                                e.preventDefault();
                                handleArchive();
                            }}
                            disabled={
                                isArchiving ||
                                (isDefault && (!newDefaultBomId || activeBomOptions.length === 0))
                            }
                            className="bg-orange-600 text-white hover:bg-orange-700"
                        >
                            {isArchiving ? 'Menonaktifkan...' : 'Nonaktifkan'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Reactivate Dialog */}
            <AlertDialog open={showReactivateDialog} onOpenChange={setShowReactivateDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Aktifkan kembali resep?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Resep <strong>{name}</strong> akan muncul kembali di daftar produksi aktif.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isReactivating}>Batal</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => {
                                e.preventDefault();
                                handleReactivate();
                            }}
                            disabled={isReactivating}
                            className="bg-green-600 text-white hover:bg-green-700"
                        >
                            {isReactivating ? 'Mengaktifkan...' : 'Aktifkan'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {productVariantId && (itemCount ?? 0) > 0 && (
                <DuplicateBomDialog
                    open={showDuplicateDialog}
                    onOpenChange={setShowDuplicateDialog}
                    sourceBom={{
                        id,
                        name,
                        productVariantId,
                        productVariantName: productVariantName || '',
                        outputQuantity: outputQuantity ?? 1,
                        itemCount,
                        category: category || 'STANDARD',
                    }}
                />
            )}
        </>
    );
}
