'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { cn } from '@/lib/utils/utils';
import { useSidebarCollapse } from '@/components/layout/sidebar-collapse-context';

export function OwnerLearningNotice() {
    const { data: session, status } = useSession();
    const { isCollapsed } = useSidebarCollapse();
    const [notice, setNotice] = useState<{
        version: string;
        accountKey: string;
    } | null>(null);
    const accountKey = `${session?.user?.tenantId ?? ''}:${session?.user?.id ?? ''}`;
    const [dismissed, setDismissed] = useState(false);
    useEffect(() => {
        if (status !== 'authenticated' || session?.user?.isSuperAdmin) return;
        let disposed = false;
        fetch('/api/analytics/learning-notice')
            .then((response) => (response.ok ? response.json() : null))
            .then((data) => {
                if (
                    !disposed &&
                    data?.active &&
                    typeof data.version === 'string'
                ) {
                    setNotice({ version: data.version, accountKey });
                    try {
                        setDismissed(
                            sessionStorage.getItem(
                                `owner-learning-notice:${accountKey}:${data.version}`,
                            ) === 'seen',
                        );
                    } catch {
                        /* notice remains visible */
                    }
                }
            })
            .catch(() => {});
        return () => {
            disposed = true;
        };
    }, [status, session?.user?.isSuperAdmin, accountKey]);
    if (
        !notice ||
        notice.accountKey !== accountKey ||
        dismissed ||
        status !== 'authenticated'
    )
        return null;
    return (
        <aside
            aria-label="Informasi analisis penggunaan"
            className={cn(
                'fixed bottom-4 left-4 right-4 z-[60] max-h-[calc(100dvh-2rem)] max-w-lg overflow-y-auto rounded-lg border bg-card p-4 text-sm shadow-lg transition-[left] duration-300',
                isCollapsed ? 'lg:left-20' : 'lg:left-68',
            )}
        >
            <p className="font-semibold">
                Analisis penggunaan untuk perbaikan layanan
            </p>
            <p className="mt-2 leading-relaxed">
                Owner perusahaan menganalisis aktivitas akun dan transaksi
                bisnis untuk memahami hambatan kerja dan kebutuhan layanan. Data
                turunan disimpan 90 hari, tidak dikirim ke AI eksternal, dan
                bukan penilaian otomatis karyawan. Hubungi admin perusahaan
                untuk klarifikasi atau koreksi data.
            </p>
            <button
                className="mt-3 min-h-11 rounded-md border px-4"
                onClick={() => {
                    try {
                        sessionStorage.setItem(
                            `owner-learning-notice:${accountKey}:${notice.version}`,
                            'seen',
                        );
                    } catch {
                        /* session-only UI state */
                    }
                    setDismissed(true);
                }}
            >
                Tutup informasi
            </button>
        </aside>
    );
}
