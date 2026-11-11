'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { MobileErrorState } from '@/components/mobile/MobileErrorState';

/** Read failure that forwards the specific reason instead of a generic text. */
export function HrdReadError({
    title,
    message,
}: {
    title: string;
    message?: string;
}) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();

    return (
        <MobileErrorState
            title={title}
            message={message}
            headingLevel={1}
            retryLabel={pending ? 'Memuat…' : 'Coba lagi'}
            onRetry={() => startTransition(() => router.refresh())}
            className="rounded-xl border bg-card"
        />
    );
}
