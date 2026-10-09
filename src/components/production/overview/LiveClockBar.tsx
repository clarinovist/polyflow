'use client';

import Link from 'next/link';
import { Monitor, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface LiveClockBarProps {
    onRefresh: () => void;
    isLoading: boolean;
    generatedAt: string;
    kioskHref: string | null;
}

export function formatWibUpdateTime(date: Date): string {
    return new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Jakarta',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).format(date);
}

/** The portal header owns the clock. This bar reports server data freshness. */
export function LiveClockBar({
    onRefresh,
    isLoading,
    generatedAt,
    kioskHref,
}: LiveClockBarProps) {
    const generated = new Date(generatedAt);
    const valid = !Number.isNaN(generated.getTime());
    return (
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 text-xs text-muted-foreground">
            <p role="status" aria-live="polite">
                {isLoading
                    ? 'Memperbarui…'
                    : valid
                      ? `Snapshot server ${formatWibUpdateTime(generated)} WIB · otomatis 30 detik`
                      : 'Waktu snapshot server tidak tersedia'}
            </p>
            <Button
                onClick={onRefresh}
                disabled={isLoading}
                variant="outline"
                size="sm"
                className="min-h-11 gap-2"
            >
                <RefreshCw
                    className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`}
                />
                Segarkan
            </Button>
            {kioskHref && (
                <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="min-h-11 gap-2"
                >
                    <Link href={kioskHref}>
                        <Monitor className="h-4 w-4" />
                        Kiosk
                    </Link>
                </Button>
            )}
        </div>
    );
}
