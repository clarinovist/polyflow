import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/utils';

export type KioskTone = 'neutral' | 'go' | 'tag' | 'warn' | 'stop' | 'info';

const TONE_CLASS: Record<KioskTone, string> = {
    neutral: 'border-border bg-muted text-foreground',
    go: 'border-transparent bg-kiosk-go-soft text-kiosk-go-ink',
    tag: 'border-transparent bg-kiosk-tag-soft text-kiosk-tag-ink',
    warn: 'border-transparent bg-kiosk-warn-soft text-kiosk-warn-ink',
    stop: 'border-transparent bg-kiosk-stop-soft text-kiosk-stop-ink',
    info: 'border-transparent bg-kiosk-info-soft text-kiosk-info',
};

interface KioskPillProps {
    tone?: KioskTone;
    /** Pulsing dot for something that is running right now. */
    live?: boolean;
    children: ReactNode;
    className?: string;
}

/** Status label with one size and one color system across the kiosk. */
export function KioskPill({
    tone = 'neutral',
    live = false,
    children,
    className,
}: KioskPillProps) {
    return (
        <span
            className={cn(
                'inline-flex min-h-7 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold leading-tight',
                TONE_CLASS[tone],
                className,
            )}
        >
            {live && (
                <span
                    aria-hidden="true"
                    className="size-2 shrink-0 animate-pulse rounded-full bg-current"
                />
            )}
            {children}
        </span>
    );
}
