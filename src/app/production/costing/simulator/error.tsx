'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';

export default function HppPriceSimulatorError({
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <div className="space-y-4">
            <h1 className="text-3xl font-bold">Simulator HPP & Harga</h1>
            <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Simulator tidak dapat dimuat</AlertTitle>
                <AlertDescription>
                    Data biaya tidak diganti dengan nilai palsu. Coba lagi atau
                    kembali ke Analisis Biaya.
                </AlertDescription>
            </Alert>
            <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={reset}>
                    Coba lagi
                </Button>
                <Button variant="outline" asChild>
                    <Link href="/production/costing">Kembali</Link>
                </Button>
            </div>
        </div>
    );
}
