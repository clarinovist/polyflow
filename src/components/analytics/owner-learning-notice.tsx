'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

export function OwnerLearningNotice() {
    const { data: session, status } = useSession();
    const [notice, setNotice] = useState<{ version: string; accountKey: string } | null>(null);
    const accountKey = `${session?.user?.tenantId ?? ''}:${session?.user?.id ?? ''}`;
    const [dismissed, setDismissed] = useState(false);
    useEffect(() => {
        if (status !== 'authenticated' || session?.user?.isSuperAdmin) return;
        let disposed = false;
        fetch('/api/analytics/learning-notice').then(response => response.ok ? response.json() : null).then(data => {
            if (!disposed && data?.active && typeof data.version === 'string') {
                setNotice({ version: data.version, accountKey });
                try { setDismissed(sessionStorage.getItem(`owner-learning-notice:${accountKey}:${data.version}`) === 'seen'); } catch { /* notice remains visible */ }
            }
        }).catch(() => {});
        return () => { disposed = true; };
    }, [status, session?.user?.isSuperAdmin, accountKey]);
    if (!notice || notice.accountKey !== accountKey || dismissed || status !== 'authenticated') return null;
    return <aside aria-label="Informasi analisis penggunaan" className="fixed bottom-4 left-4 right-4 z-40 max-w-lg rounded-lg border bg-card p-4 text-sm shadow-lg">
        <p className="font-semibold">Analisis penggunaan untuk perbaikan layanan</p>
        <p className="mt-2 leading-relaxed">Owner perusahaan menganalisis aktivitas akun dan transaksi bisnis untuk memahami hambatan kerja dan kebutuhan layanan. Data turunan disimpan 90 hari, tidak dikirim ke AI eksternal, dan bukan penilaian otomatis karyawan. Hubungi admin perusahaan untuk klarifikasi atau koreksi data.</p>
        <button className="mt-3 min-h-11 rounded-md border px-4" onClick={() => {
            try { sessionStorage.setItem(`owner-learning-notice:${accountKey}:${notice.version}`, 'seen'); } catch { /* session-only UI state */ }
            setDismissed(true);
        }}>Tutup informasi</button>
    </aside>;
}
