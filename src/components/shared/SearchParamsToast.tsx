'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

const ERROR_MESSAGES: Record<string, { title: string; description: string }> = {
    'not-found': {
        title: 'Sesi tidak ditemukan',
        description: 'Sesi stock opname yang Anda cari sudah dihapus atau tidak tersedia.',
    },
};

export function SearchParamsToast() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const error = searchParams.get('error');

    useEffect(() => {
        if (error && ERROR_MESSAGES[error]) {
            const { title, description } = ERROR_MESSAGES[error];
            toast.error(title, { description });
            // Clean up the URL without triggering a navigation
            const url = new URL(window.location.href);
            url.searchParams.delete('error');
            router.replace(url.pathname, { scroll: false });
        }
    }, [error, router]);

    return null;
}
