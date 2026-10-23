'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

type Request = { title: string; description: string; confirmLabel?: string };

/** Application confirmation for the existing production actions; no mutation lives here. */
export function useProductionConfirm() {
    const [request, setRequest] = useState<Request | null>(null);
    const pending = useRef<((accepted: boolean) => void) | null>(null);
    const trigger = useRef<HTMLElement | null>(null);
    useEffect(() => () => { pending.current?.(false); pending.current = null; }, []);

    const confirm = (next: Request) => {
        // A second click cannot replace an unresolved decision.
        if (pending.current) return Promise.resolve(false);
        trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        return new Promise<boolean>((resolve) => {
            pending.current = resolve;
            setRequest(next);
        });
    };
    const finish = (accepted: boolean) => {
        const resolve = pending.current;
        pending.current = null;
        setRequest(null);
        resolve?.(accepted);
    };

    return {
        confirm,
        confirmationDialog: (
            <AlertDialog open={request !== null} onOpenChange={(open) => { if (!open) finish(false); }}>
                <AlertDialogContent onCloseAutoFocus={(event) => { event.preventDefault(); trigger.current?.focus(); }}>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{request?.title}</AlertDialogTitle>
                        <AlertDialogDescription className="whitespace-pre-line max-h-[50vh] overflow-auto">{request?.description}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => finish(false)}>Batal</AlertDialogCancel>
                        <AlertDialogAction onClick={() => finish(true)}>{request?.confirmLabel ?? 'Lanjutkan'}</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        ),
    };
}
