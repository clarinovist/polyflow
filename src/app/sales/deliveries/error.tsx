'use client';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
export default function Error({
    error,
    retry,
}: {
    error: Error & { digest?: string };
    retry: () => void;
}) {
    useEffect(() => {
        console.error('[sales/deliveries]', error);
    }, [error]);
    return (
        <div className="space-y-4 p-4 md:p-6">
            <h1 className="text-2xl font-bold md:text-3xl">Surat Jalan</h1>
            <div
                role="alert"
                className="rounded-lg border border-destructive/40 bg-destructive/10 p-4"
            >
                <p className="font-medium text-destructive">
                    Daftar Surat Jalan gagal dimuat.
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                    Data tidak dianggap kosong. Coba lagi tanpa mengubah filter.
                </p>
            </div>
            <Button type="button" onClick={retry}>
                Coba lagi
            </Button>
        </div>
    );
}
