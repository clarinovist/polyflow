'use client';

import { RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

/** Re-runs the server render of the current HRD page after a failed load. */
export function HrdRetryButton() {
    const router = useRouter();

    return (
        <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11 gap-2"
            onClick={() => router.refresh()}
        >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Coba lagi
        </Button>
    );
}
