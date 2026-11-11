'use client';

import { Button } from '@/components/ui/button';

interface Props {
    message: string;
    onRetry: () => void;
}

/** State galat bersama untuk rekap absensi: pesan jujur + tombol coba lagi. */
export function AttendanceLoadError({ message, onRetry }: Props) {
    return (
        <div
            role="alert"
            className="bg-card rounded-xl border border-destructive/30 p-8 text-center space-y-3"
        >
            <p className="text-sm text-destructive">{message}</p>
            <Button type="button" size="sm" variant="outline" onClick={onRetry}>
                Coba lagi
            </Button>
        </div>
    );
}
