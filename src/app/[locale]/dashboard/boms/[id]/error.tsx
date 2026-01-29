'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BrandCard, BrandCardContent } from '@/components/brand/BrandCard';

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    return (
        <div className="flex items-center justify-center min-h-[500px]">
            <BrandCard className="max-w-md w-full border-red-500/20 bg-red-500/5">
                <BrandCardContent className="flex flex-col items-center text-center p-8">
                    <div className="h-12 w-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4 text-red-500">
                        <AlertTriangle className="h-6 w-6" />
                    </div>

                    <h2 className="text-xl font-black text-red-600 dark:text-red-400 mb-2">
                        Failed to load recipe
                    </h2>

                    <p className="text-sm text-muted-foreground mb-6">
                        We encountered an unexpected error while trying to load the BOM details.
                        {error.message && <span className="block mt-2 font-mono text-xs opacity-70">{error.message}</span>}
                    </p>

                    <Button
                        onClick={() => reset()}
                        variant="outline"
                        className="border-red-500/20 hover:bg-red-500/10 hover:text-red-600"
                    >
                        <RefreshCcw className="h-4 w-4 mr-2" />
                        Try Again
                    </Button>
                </BrandCardContent>
            </BrandCard>
        </div>
    );
}
