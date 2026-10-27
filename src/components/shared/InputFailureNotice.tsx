'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import type { InputFailure } from '@/lib/errors/input-failure';

/** Persistent, focusable feedback; never relies on a short-lived toast. */
export function InputFailureNotice({
    failure,
    children,
}: {
    failure: InputFailure;
    children?: ReactNode;
}) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        ref.current?.focus();
    }, [failure]);
    return (
        <div
            ref={ref}
            role="alert"
            tabIndex={-1}
            className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
            <p className="font-semibold">{failure.title}</p>
            <p className="break-words leading-relaxed">{failure.message}</p>
            {failure.code && (
                <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer py-1">Kode bantuan untuk admin</summary>
                    <p className="break-all py-1">{failure.code}</p>
                </details>
            )}
            {children}
        </div>
    );
}
