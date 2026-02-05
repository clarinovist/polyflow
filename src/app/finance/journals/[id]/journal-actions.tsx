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
    AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { postJournal, voidJournal, reverseJournal } from '@/actions/journal';
import { toast } from 'sonner';
import { Loader2, CheckCircle, Ban, RotateCcw } from 'lucide-react';

interface JournalActionsProps {
    id: string;
    status: 'DRAFT' | 'POSTED' | 'VOIDED';
}

export function JournalActions({ id, status }: JournalActionsProps) {
    const [loading, setLoading] = useState(false);

    const handleAction = async (action: 'post' | 'void' | 'reverse') => {
        setLoading(true);
        try {
            let result;
            if (action === 'post') result = await postJournal(id);
            if (action === 'void') result = await voidJournal(id);
            if (action === 'reverse') result = await reverseJournal(id);

            if (result?.success) {
                toast.success(`Journal ${action}ed successfully`);
            } else {
                toast.error(result?.error || 'Action failed');
            }
        } catch (_error) {
            toast.error('An unexpected error occurred');
        } finally {
            setLoading(false);
        }
    };

    if (status === 'VOIDED') {
        return <Button variant="outline" disabled>Voided</Button>;
    }

    return (
        <div className="flex gap-2">
            {status === 'DRAFT' && (
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button disabled={loading}>
                            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                            Post Journal
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Post Journal Entry?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This will finalize the journal entry and update account balances. It cannot be edited afterwards, only voided or reversed.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleAction('post')}>Confirm Post</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            )}

            {status === 'POSTED' && (
                <>
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="outline" disabled={loading}>
                                <RotateCcw className="mr-2 h-4 w-4" /> Reverse
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Reverse Journal Entry?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This will create a new journal entry with swapped debit/credit lines to offset this entry.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleAction('reverse')}>Confirm Reversal</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>

                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive" disabled={loading}>
                                <Ban className="mr-2 h-4 w-4" /> Void
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Void Journal Entry?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Are you sure you want to VOID this journal? This action strictly reverts the transaction.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleAction('void')} className="bg-destructive hover:bg-destructive/90">
                                    Confirm Void
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </>
            )}
        </div>
    );
}
