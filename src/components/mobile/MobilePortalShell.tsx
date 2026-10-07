import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/utils';
import { LiveMobileConnectivity } from './LiveMobileConnectivity';

interface MobilePortalShellProps {
    children: ReactNode;
    header: ReactNode;
    bottomNavigation: ReactNode;
    contentId: string;
    showConnectivity?: boolean;
    className?: string;
    mainClassName?: string;
}

/** Shared mobile chrome. Kiosk intentionally keeps its dedicated focus shell. */
export function MobilePortalShell({
    children,
    header,
    bottomNavigation,
    contentId,
    showConnectivity = true,
    className,
    mainClassName,
}: MobilePortalShellProps) {
    return (
        <div
            className={cn(
                'min-h-dvh min-w-0 overflow-x-hidden bg-slate-50 pb-[calc(5rem+env(safe-area-inset-bottom))] dark:bg-slate-900',
                className,
            )}
        >
            <a
                href={`#${contentId}`}
                className="sr-only z-[70] rounded-md bg-background px-3 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:ring-2 focus:ring-ring"
            >
                Lewati ke konten utama
            </a>
            {header}
            {showConnectivity && <LiveMobileConnectivity />}
            <main
                id={contentId}
                tabIndex={-1}
                className={cn('min-w-0 px-4 py-4 pb-16', mainClassName)}
            >
                {children}
            </main>
            {bottomNavigation}
        </div>
    );
}
