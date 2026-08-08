'use client';

import { DialogFooter } from '@/components/ui/dialog';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, Trash2, Copy, Upload, Wand2 } from 'lucide-react';

type RouteDayDrawerActionsProps = {
    isSaving: boolean;
    loading: boolean;
    planId: string | null;
    repName: string;
    formattedDate: string;
    isDirty: boolean;
    itemsCount: number;
    onCopyLastWeek: () => void;
    onLoadTemplates: () => void;
    onImportExcel: () => void;
    onOptimize: () => void;
    onDelete: () => void;
    onSaveDraft: () => void;
    onPublish: () => void;
};

/**
 * Footer drawer: menu overflow "Lainnya" (R8 — bukan 9 tombol sejajar lagi),
 * Hapus lewat AlertDialog (R10, bukan window.confirm), lalu aksi utama
 * Simpan Draft / Terbitkan.
 */
export function RouteDayDrawerActions({
    isSaving,
    loading,
    planId,
    repName,
    formattedDate,
    isDirty,
    itemsCount,
    onCopyLastWeek,
    onLoadTemplates,
    onImportExcel,
    onOptimize,
    onDelete,
    onSaveDraft,
    onPublish,
}: RouteDayDrawerActionsProps) {
    return (
        <DialogFooter className="flex-row flex-wrap justify-between sm:justify-between gap-2">
            <div className="flex gap-2">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={isSaving || loading}
                        >
                            <MoreHorizontal className="h-4 w-4 mr-1" />
                            Lainnya
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                        <DropdownMenuItem onClick={onCopyLastWeek}>
                            <Copy className="h-3.5 w-3.5 mr-2" />
                            Salin Minggu Lalu
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={onLoadTemplates}>
                            <Copy className="h-3.5 w-3.5 mr-2" />
                            Gunakan Template
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={onImportExcel}>
                            <Upload className="h-3.5 w-3.5 mr-2" />
                            Import Excel
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={onOptimize}
                            disabled={!planId}
                        >
                            <Wand2 className="h-3.5 w-3.5 mr-2" />
                            Optimasi Rute
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>

                {planId && (
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button
                                variant="destructive"
                                size="sm"
                                disabled={isSaving}
                            >
                                <Trash2 className="h-4 w-4 mr-1" />
                                Hapus
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>
                                    Hapus rute ini?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                    Rute {repName} pada {formattedDate} akan
                                    dihapus permanen. Tindakan ini tidak bisa
                                    dibatalkan.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Batal</AlertDialogCancel>
                                <AlertDialogAction onClick={onDelete}>
                                    Hapus
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                )}
            </div>

            <div className="flex gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={onSaveDraft}
                    disabled={isSaving || loading || !isDirty}
                >
                    Simpan Draft
                </Button>
                <Button
                    size="sm"
                    onClick={onPublish}
                    disabled={isSaving || loading || itemsCount === 0}
                >
                    Terbitkan
                </Button>
            </div>
        </DialogFooter>
    );
}
