'use client';

import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <html>
            <body className="bg-zinc-50 dark:bg-zinc-950">
                <div className="flex min-h-screen items-center justify-center p-6">
                    <div className="mx-auto max-w-md text-center">
                        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20">
                            <AlertTriangle className="h-10 w-10 text-red-600 dark:text-red-400" />
                        </div>

                        <h1 className="mb-2 text-3xl font-bold text-zinc-900 dark:text-zinc-100">
                            Application Error
                        </h1>

                        <p className="mb-6 text-zinc-500 dark:text-zinc-400">
                            A critical error occurred. Please try refreshing the page.
                            {error.digest && (
                                <span className="mt-2 block font-mono text-xs text-zinc-400">
                                    Reference: {error.digest}
                                </span>
                            )}
                        </p>

                        <Button onClick={reset} size="lg" className="gap-2">
                            <RefreshCw className="h-4 w-4" />
                            Refresh Page
                        </Button>
                    </div>
                </div>
            </body>
        </html>
    );
}
