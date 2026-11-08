'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Error({
    error,
    retry,
}: {
    error: Error & { digest?: string };
    retry: () => void;
}) {
    useEffect(() => {
        console.error('[Kiosk error boundary]', error);
    }, [error]);

    return (
        <section
            role="alert"
            className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center"
        >
            <AlertTriangle
                aria-hidden="true"
                className="size-14 text-destructive"
            />
            <h1 className="text-2xl font-bold">Kiosk mengalami kendala</h1>
            <p className="text-lg text-muted-foreground">
                Halaman tidak dapat ditampilkan. Data produksi tidak diubah;
                coba lagi atau panggil leader bila masih gagal.
            </p>
            <Button size="lg" className="min-h-14 px-8 text-lg" onClick={retry}>
                Coba lagi
            </Button>
        </section>
    );
}
