'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Monitor } from 'lucide-react';
import { desktopRequiredLabels as L } from '@/lib/labels/mobile';
import {
    isMobileBypassAllowed,
} from '@/lib/mobile/mobile-access-policy';
import { useSession } from 'next-auth/react';
import {
    DEFAULT_DESKTOP_VIEW_DAYS,
    DESKTOP_VIEW_DURATIONS,
    desktopViewLabel,
    enableDesktopView,
    getPreferredDesktopViewDays,
    setPreferredDesktopViewDays,
    type DesktopViewDays,
} from '@/lib/mobile/desktop-view';
import { cn } from '@/lib/utils/utils';

export function DesktopRequiredClient() {
    const searchParams = useSearchParams();
    const { data: session } = useSession();
    const from = searchParams.get('from');

    const user = session?.user as
        | { role?: string; roles?: string[] }
        | undefined;
    const bypassAllowed = isMobileBypassAllowed(user);

    const homePath = session?.user ? '/mobile' : null;
    const homeLabel = 'Periksa Portal Mobile';

    const [days, setDays] = useState<DesktopViewDays>(
        DEFAULT_DESKTOP_VIEW_DAYS,
    );
    useEffect(() => {
        setDays(getPreferredDesktopViewDays());
    }, []);

    const chooseDays = (next: DesktopViewDays) => {
        setDays(next);
        setPreferredDesktopViewDays(next);
    };

    const handleBypass = () => {
        enableDesktopView(days, from);
    };

    return (
        <div className="min-h-dvh flex items-center justify-center bg-background px-6">
            <div className="max-w-sm w-full text-center space-y-6">
                <div className="flex justify-center">
                    <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                        <Monitor className="h-8 w-8 text-muted-foreground" />
                    </div>
                </div>

                <div className="space-y-2">
                    <h1 className="text-xl font-bold text-foreground">
                        {L.title}
                    </h1>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        {L.body}
                    </p>
                </div>

                {from && (
                    <p className="text-xs text-muted-foreground/60">
                        {L.fromPrefix} {from}
                    </p>
                )}

                <div className="space-y-3">
                    {homePath ? (
                        <Link
                            href={homePath}
                            className="block w-full py-3 px-4 rounded-lg bg-primary text-primary-foreground font-medium text-sm transition-colors hover:bg-primary/90 active:scale-[0.98]"
                        >
                            {homeLabel}
                        </Link>
                    ) : (
                        <Link
                            href="/login"
                            className="block w-full py-3 px-4 rounded-lg bg-primary text-primary-foreground font-medium text-sm transition-colors hover:bg-primary/90 active:scale-[0.98]"
                        >
                            {L.cta.login}
                        </Link>
                    )}

                    {bypassAllowed && (
                        <>
                            <button
                                type="button"
                                onClick={handleBypass}
                                className="block w-full py-3 px-4 rounded-lg border border-border bg-card text-foreground font-medium text-sm transition-colors hover:bg-accent/50 active:scale-[0.98]"
                            >
                                Buka versi desktop ({desktopViewLabel(days)})
                            </button>
                            <div
                                role="radiogroup"
                                aria-label="Lama versi desktop aktif"
                                className="grid grid-cols-3 gap-2"
                            >
                                {DESKTOP_VIEW_DURATIONS.map((option) => (
                                    <button
                                        key={option.days}
                                        type="button"
                                        role="radio"
                                        aria-checked={days === option.days}
                                        onClick={() => chooseDays(option.days)}
                                        className={cn(
                                            'min-h-11 rounded-lg border px-2 text-xs font-medium transition-colors',
                                            days === option.days
                                                ? 'border-primary bg-primary/10 text-foreground'
                                                : 'border-border bg-card text-muted-foreground hover:bg-accent/50',
                                        )}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
