'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { MobileErrorState } from './MobileErrorState';

/** Expected read failure. Keep it distinct from both empty data and thrown errors. */
export function MobileReadError({ title = 'Data belum dapat dimuat' }: { title?: string }) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();

    return (
        <MobileErrorState
            title={title}
            headingLevel={1}
            retryLabel={pending ? 'Memuat…' : 'Coba lagi'}
            onRetry={() => startTransition(() => router.refresh())}
            className="rounded-xl border bg-card"
        />
    );
}
