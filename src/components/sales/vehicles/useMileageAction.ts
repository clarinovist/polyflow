'use client';

import { useState } from 'react';

type ActionResult = { success: true } | { success: false; error: string };

/** Runs one mileage server action with busy/error state; resolves true only on success. */
export function useMileageAction() {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    async function run(action: () => Promise<ActionResult>): Promise<boolean> {
        setBusy(true);
        setError('');
        try {
            const result = await action();
            if (!result.success) { setError(result.error || 'Gagal menyimpan.'); return false; }
            return true;
        } catch {
            setError('Gagal menyimpan. Silakan coba lagi.');
            return false;
        } finally {
            setBusy(false);
        }
    }
    return { busy, error, setError, run };
}
