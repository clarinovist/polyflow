'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { RotateCcw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { voidProductionOutput } from '@/actions/production';
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
                toast.success(`Execution for ${orderNumber} voided successfully`);
            } else {
                toast.error(result.error || 'Failed to void execution');
            }
        } catch (_error) {
            toast.error('An unexpected error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Void Production Output</AlertDialogTitle>
                    <AlertDialogDescription>
                        Are you sure you want to void this production output for <strong>{orderNumber}</strong>?
                        This will reverse stock movements and update the production order totals.
                        This action is permanent.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={handleVoid}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                        Void Execution
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
