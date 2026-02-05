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
import { Lock } from 'lucide-react';
import { closeFiscalPeriod } from '@/actions/accounting';
import { toast } from 'sonner';

interface ClosePeriodButtonProps {
    id: string;
    name: string;
}

export function ClosePeriodButton({ id, name }: ClosePeriodButtonProps) {
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);

    const handleClose = async () => {
        setLoading(true);
        try {
            const result = await closeFiscalPeriod(id);
            if (result.success) {
                toast.success(`Period ${name} closed successfully`);
                setOpen(false);
            } else {
                toast.error(result.error || 'Failed to close period');
            }
        } catch (_error) {
            toast.error('An unexpected error occurred');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AlertDialog open={open} onOpenChange={setOpen}>
            <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-orange-600 border-orange-200 hover:bg-orange-50">
                    <Lock className="h-4 w-4 mr-2" />
                    Close Period
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Close Period {name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Closing a period will block all new journal entries and edits for this month.
                        This is usually done after financial auditing is complete.
                        <strong>This action can only be reversed by a system admin.</strong>
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={(e) => {
                            e.preventDefault();
                            handleClose();
                        }}
                        disabled={loading}
                        className="bg-orange-600 hover:bg-orange-700"
                    >
                        {loading ? 'Closing...' : 'Confirm Close'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
