'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

/** A failed read is not an empty business result. Never expose raw DB errors. */
export function MobileReadError({ title = 'Data belum dapat dimuat' }: { title?: string }) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    return (
        <section role="alert" className="space-y-3 rounded-xl border p-4">
            <h1 className="text-lg font-semibold">{title}</h1>
            <p className="text-sm text-muted-foreground">Data tidak tersedia saat ini. Coba muat ulang; angka kosong bukan berarti tidak ada transaksi.</p>
            <button type="button" disabled={pending} onClick={() => startTransition(() => router.refresh())}
                className="min-h-11 rounded-lg bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50">
                {pending ? 'Memuat…' : 'Coba lagi'}
            </button>
        </section>
    );
}
