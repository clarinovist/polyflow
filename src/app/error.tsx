'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Log to error reporting service (Sentry integration point)
        console.error('[ErrorBoundary]', error);
    }, [error]);

    return (
        <div className="flex min-h-[60vh] items-center justify-center p-6">
            <div className="mx-auto max-w-md text-center">
                <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20">
                    <AlertTriangle className="h-8 w-8 text-red-600 dark:text-red-400" />
                </div>

                <h2 className="mb-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
                    Something went wrong
                </h2>

                <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
                    An unexpected error occurred. Our team has been notified.
                    {error.digest && (
                        <span className="mt-1 block font-mono text-xs text-zinc-400">
                            Error ID: {error.digest}
                        </span>
                    )}
                </p>

                <div className="flex items-center justify-center gap-3">
                    <Button
                        onClick={reset}
                        variant="default"
                        className="gap-2"
                    >
                        <RefreshCw className="h-4 w-4" />
                        Try Again
                    </Button>
                    <Button variant="outline" asChild>
                        <Link href="/dashboard" className="gap-2">
                            <Home className="h-4 w-4" />
                            Dashboard
                        </Link>
                    </Button>
                </div>
            </div>
        </div>
    );
}
