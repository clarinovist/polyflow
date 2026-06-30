'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { RotateCcw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
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
} from "@/components/ui/alert-dialog";

interface VoidExecutionButtonProps {
    executionId: string;
    productionOrderId: string;
    orderNumber: string;
}

export function VoidExecutionButton({ executionId, productionOrderId, orderNumber }: VoidExecutionButtonProps) {
    const [isLoading, setIsLoading] = useState(false);

    const handleVoid = async () => {
        try {
            setIsLoading(true);
            const result = await voidProductionOutput(executionId, productionOrderId);
            if (result.success) {
                toast.success(`Realisasi produksi untuk ${orderNumber} berhasil dibatalkan.`);
            } else {
                toast.error(result.error || 'Gagal membatalkan eksekusi');
            }
        } catch (_error) {
            toast.error('Gagal memproses. Silakan coba lagi.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" disabled={isLoading}>
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Void Output Produksi</AlertDialogTitle>
                    <AlertDialogDescription>
                        Yakin ingin mem-void output produksi untuk <strong>{orderNumber}</strong>?
                        Ini akan membalik mutasi stok dan memperbarui total order produksi.
                        Tindakan ini bersifat permanen.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Batal</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={handleVoid}
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
