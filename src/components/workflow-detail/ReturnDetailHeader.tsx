'use client';

import { useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, Ban, MoreHorizontal } from 'lucide-react';
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
} from '@/components/ui/alert-dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ReturnDetailHeaderProps {
    backHref: string;
    title: string;
    subtitle: string;
    statusBadge: ReactNode;
    primaryAction?: ReactNode;
    canCancel: boolean;
    isLoading: boolean;
    onCancel: () => Promise<boolean>;
}

export function ReturnDetailHeader({
    backHref,
    title,
    subtitle,
    statusBadge,
    primaryAction,
    canCancel,
    isLoading,
    onCancel,
}: ReturnDetailHeaderProps) {
    const [cancelOpen, setCancelOpen] = useState(false);
    const moreActionsRef = useRef<HTMLButtonElement>(null);

    return (
        <>
            <header className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm lg:p-5 xl:sticky xl:top-4 xl:z-20 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 space-y-3">
                    <Button variant="outline" size="sm" asChild className="min-h-11">
                        <Link href={backHref}>
                            <ArrowLeft className="h-4 w-4" /> Kembali
                        </Link>
                    </Button>
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="break-words text-2xl font-bold tracking-tight sm:text-3xl">
                                {title}
                            </h1>
                            {statusBadge}
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                            {subtitle}
                        </p>
                    </div>
                </div>

                {(primaryAction || canCancel) && (
                    <div
                        role="group"
                        aria-label="Aksi retur"
                        className="flex flex-wrap items-center gap-2 [&_button]:min-h-11"
                    >
                        {primaryAction}
                        {canCancel && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        ref={moreActionsRef}
                                        variant="outline"
                                        disabled={isLoading}
                                    >
                                        <MoreHorizontal className="h-4 w-4" />
                                        Lainnya
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                    align="end"
                                    onCloseAutoFocus={(event) => {
                                        if (cancelOpen) event.preventDefault();
                                    }}
                                >
                                    <DropdownMenuItem
                                        variant="destructive"
                                        className="min-h-11"
                                        onSelect={() => setCancelOpen(true)}
                                    >
                                        <Ban className="h-4 w-4" />
                                        Batalkan Retur
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                    </div>
                )}
            </header>

            <AlertDialog
                open={cancelOpen}
                onOpenChange={(open) => {
                    if (!isLoading) setCancelOpen(open);
                }}
            >
                <AlertDialogContent
                    onCloseAutoFocus={(event) => {
                        event.preventDefault();
                        moreActionsRef.current?.focus();
                    }}
                >
                    <AlertDialogHeader>
                        <AlertDialogTitle>Batalkan retur?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Retur {title} akan dibatalkan. Pastikan transaksi ini
                            memang tidak akan dilanjutkan.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isLoading}>
                            Kembali
                        </AlertDialogCancel>
                        <AlertDialogAction
                            disabled={isLoading}
                            className="bg-destructive text-white hover:bg-destructive/90"
                            onClick={async (event) => {
                                event.preventDefault();
                                if (await onCancel()) setCancelOpen(false);
                            }}
                        >
                            Batalkan Retur
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
