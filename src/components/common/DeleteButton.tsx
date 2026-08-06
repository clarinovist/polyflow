'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
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
import { Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

interface DeleteButtonProps {
    id: string;
    onDelete: (id: string) => Promise<{ success: boolean; error?: string }>;
    entityName?: string;
    onDeleted?: (id: string) => void;
    /** Controlled open state — when provided, the confirm dialog is controlled externally (e.g. triggered from a dropdown menu item). */
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    /** When true, don't render the default trash-icon trigger button — the caller controls `open` externally instead. */
    hideTrigger?: boolean;
}

export function DeleteButton({
    id,
    onDelete,
    entityName = 'Item',
    onDeleted,
    open: externalOpen,
    onOpenChange: externalOnOpenChange,
    hideTrigger = false,
}: DeleteButtonProps) {
    const [isDeleting, setIsDeleting] = useState(false);
    const [internalOpen, setInternalOpen] = useState(false);
    const open = externalOpen ?? internalOpen;
    const setOpen = externalOnOpenChange ?? setInternalOpen;
    const router = useRouter();

    async function handleDelete() {
        setIsDeleting(true);
        try {
            const result = await onDelete(id);
            if (result.success) {
                toast.success(`${entityName} berhasil dihapus`);
                setOpen(false);
                router.refresh();
                onDeleted?.(id);
            } else {
                toast.error(result.error || `Gagal menghapus ${entityName}.`);
            }
        } catch {
            toast.error('Gagal memproses. Silakan coba lagi.');
        } finally {
            setIsDeleting(false);
        }
    }

    return (
        <AlertDialog open={open} onOpenChange={setOpen}>
            {!hideTrigger && (
                <AlertDialogTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-500 hover:text-red-600 hover:bg-red-50"
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </AlertDialogTrigger>
            )}
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Apakah Anda yakin?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Tindakan ini tidak dapat dibatalkan. Ini akan menghapus
                        permanen {entityName.toLowerCase()}
                        {entityName !== 'Item' ? '' : ''} dan menghapusnya dari
                        server kami.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={isDeleting}>
                        Batal
                    </AlertDialogCancel>
                    <AlertDialogAction
                        onClick={(e) => {
                            e.preventDefault();
                            handleDelete();
                        }}
                        disabled={isDeleting}
                        className="bg-red-500 hover:bg-red-600 focus:ring-red-500"
                    >
                        {isDeleting && (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Delete
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
