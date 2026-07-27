'use client';

import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';

const ERROR_MESSAGES: Record<string, { title: string; description: string }> = {
    ModuleNotEntitled: {
        title: 'Modul Tidak Tersedia',
        description:
            'Modul ini belum termasuk dalam paket langganan Anda. Hubungi admin untuk mengaktifkan modul ini.',
    },
    Unauthorized: {
        title: 'Akses Ditolak',
        description:
            'Anda tidak memiliki izin untuk mengakses halaman ini.',
    },
};

export default function ErrorPage() {
    const searchParams = useSearchParams();
    const error = searchParams.get('error') || 'Unknown';
    const info = ERROR_MESSAGES[error] || {
        title: 'Terjadi Kesalahan',
        description: `Error: ${error}`,
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <Card className="max-w-md w-full">
                <CardHeader className="text-center">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                        <AlertTriangle className="h-6 w-6 text-destructive" />
                    </div>
                    <CardTitle className="text-lg">{info.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-center space-y-4">
                    <p className="text-sm text-muted-foreground">
                        {info.description}
                    </p>
                    <Button asChild>
                        <Link href="/dashboard">Kembali ke Dashboard</Link>
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
