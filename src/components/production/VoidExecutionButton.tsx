'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { RotateCcw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { inputFailure, interruptedInput, type InputFailure } from '@/lib/errors/input-failure';
import { InputFailureNotice } from '@/components/shared/InputFailureNotice';
import { voidProductionOutput } from '@/actions/production/production';
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

interface VoidExecutionButtonProps {
    executionId: string;
    productionOrderId: string;
    orderNumber: string;
}

export function VoidExecutionButton({
    executionId,
    productionOrderId,
    orderNumber,
}: VoidExecutionButtonProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const [failure, setFailure] = useState<InputFailure | null>(null);

    const handleVoid = async () => {
        try {
            setIsLoading(true);
            setFailure(null);
            const result = await voidProductionOutput(
                executionId,
                productionOrderId,
            );
            if (result.success) {
                toast.success(
                    `Realisasi produksi untuk ${orderNumber} berhasil dibatalkan.`,
                );
                setOpen(false);
            } else {
                setFailure(inputFailure(result, 'void'));
            }
        } catch (error) {
            setFailure(interruptedInput(error, 'void'));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <AlertDialog open={open} onOpenChange={(next) => {
            if (isLoading) return;
            if (next) setFailure(null);
            setOpen(next);
        }}>
            <AlertDialogTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 text-muted-foreground hover:text-destructive"
                    aria-label={`Batalkan output ${orderNumber}`}
                    disabled={isLoading}
                >
                    {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <RotateCcw className="h-4 w-4" />
                    )}
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Void Output Produksi</AlertDialogTitle>
                    <AlertDialogDescription>
                        Yakin ingin mem-void output produksi untuk{' '}
                        <strong>{orderNumber}</strong>? Ini akan membalik mutasi
                        stok dan memperbarui total order produksi. Tindakan ini
                        bersifat permanen.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                {failure && <InputFailureNotice failure={failure} />}
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={isLoading}>Batal</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={(event) => {
                            event.preventDefault();
                            void handleVoid();
                        }}
                        disabled={isLoading}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                        {isLoading ? 'Memproses void...' : 'Void Eksekusi'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
