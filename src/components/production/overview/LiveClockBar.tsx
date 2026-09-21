'use client';

import { Button } from '@/components/ui/button';
import { RefreshCw, Monitor } from 'lucide-react';
import Link from 'next/link';

interface LiveClockBarProps {
    onRefresh: () => void;
    isLoading: boolean;
    lastUpdated: Date | null;
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

/** The portal header owns the clock. This bar reports data freshness, not a guessed shift. */
export function LiveClockBar({
    onRefresh,
    isLoading,
    lastUpdated,
}: LiveClockBarProps) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <p role="status">
                {isLoading
                    ? 'Memperbarui…'
                    : lastUpdated
                      ? `Diperbarui pukul ${formatWibUpdateTime(lastUpdated)} WIB · otomatis 30 detik`
                      : 'Menunggu pembaruan'}
            </p>
            <div className="flex items-center gap-2">
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
                <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="min-h-11 gap-2"
                >
                    <Link href="/kiosk">
                        <Monitor className="h-4 w-4" />
                        Kiosk
                    </Link>
                </Button>
            </div>
        </div>
    );
}
