'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { MessageCircleHeart, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PolyflowChatPanel } from '@/components/support/polyflow-chat-panel';

const ENABLED_PATH_PREFIXES = [
    '/dashboard',
    '/warehouse',
    '/production',
    '/sales',
    '/finance',
    '/planning',
    '/purchasing',
    '/hrd',
    '/maklon',
    '/support',
    '/admin',
    '/settings',
    '/master-data',
    '/reports',
    '/report',
    '/profile',
];

export function PolyflowChatWidget({
    contextualProfilesEnabled = false,
}: {
    contextualProfilesEnabled?: boolean;
}) {
    const pathname = usePathname();
    const { data: session, status } = useSession();
    if (
        status !== 'authenticated' ||
        !session?.user?.id ||
        !ENABLED_PATH_PREFIXES.some((prefix) => pathname?.startsWith(prefix))
    )
        return null;

    return (
        <AuthenticatedWidget
            key={session.user.id}
            pathname={pathname}
            contextualProfilesEnabled={contextualProfilesEnabled}
        />
    );
}

function AuthenticatedWidget({
    pathname,
    contextualProfilesEnabled,
}: {
    pathname: string;
    contextualProfilesEnabled: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [visited, setVisited] = useState(false);
    const root = useRef<HTMLDivElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    const dialog = useRef<HTMLDivElement>(null);
    const mobile =
        pathname === '/mobile' ||
        pathname.includes('/mobile/') ||
        pathname.endsWith('/mobile') ||
        pathname.startsWith('/field/sales') ||
        pathname.startsWith('/my');

    useEffect(() => {
        if (!open) return;
        dialog.current?.focus();
        window.dispatchEvent(new Event('polyflow-assistant-open'));
        function onPointer(event: PointerEvent) {
            if (!root.current?.contains(event.target as Node)) setOpen(false);
        }
        function onKey(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                event.preventDefault();
                setOpen(false);
                trigger.current?.focus();
            }
        }
        document.addEventListener('pointerdown', onPointer);
        document.addEventListener('keydown', onKey);
        return () => {
            window.dispatchEvent(new Event('polyflow-assistant-close'));
            document.removeEventListener('pointerdown', onPointer);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    return (
        <div
            ref={root}
            // globals.css uses these sentinels to reserve one bounded area at
            // the end of document flow. No page-wide measurement is needed.
            data-polyflow-chat-fab=""
            data-mobile-safe-area={mobile ? '' : undefined}
            data-desktop-safe-area={mobile ? undefined : ''}
            className={`fixed z-[60] print:hidden ${
                mobile
                    ? 'right-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] sm:right-5'
                    : 'right-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] sm:right-5 sm:bottom-5'
            }`}
        >
            {visited && (
                <div
                    ref={dialog}
                    id="polyflow-assistant-dialog"
                    role="dialog"
                    aria-label="Asisten Polyflow"
                    tabIndex={-1}
                    hidden={!open}
                    className="absolute right-0 bottom-full mb-3 max-h-[calc(100dvh-7.5rem-env(safe-area-inset-bottom))] w-[calc(100vw-1.5rem)] max-w-[420px] outline-none sm:mb-4 sm:w-[400px] md:w-[420px]"
                >
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        aria-label="Minimize asisten"
                        className="absolute -top-3 right-3 z-10 min-h-11 min-w-11 rounded-full shadow sm:h-7 sm:min-h-7 sm:min-w-0"
                        onClick={() => {
                            setOpen(false);
                            trigger.current?.focus();
                        }}
                    >
                        <Minus className="h-4 w-4" />
                    </Button>
                    <PolyflowChatPanel
                        currentPath={pathname}
                        contextualProfilesEnabled={contextualProfilesEnabled}
                    />
                </div>
            )}
            <Button
                ref={trigger}
                size="lg"
                aria-label={
                    open ? 'Minimize Asisten Polyflow' : 'Buka Asisten Polyflow'
                }
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-controls={
                    visited ? 'polyflow-assistant-dialog' : undefined
                }
                onClick={() => {
                    setVisited(true);
                    setOpen(!open);
                }}
                className="group h-11 w-11 p-0 sm:h-14 sm:w-auto sm:px-5 rounded-full bg-gradient-to-r from-cyan-600 via-teal-600 to-emerald-600 text-white shadow-lg flex items-center justify-center"
            >
                <MessageCircleHeart className="h-5 w-5 sm:mr-2 shrink-0" />
                <span className="hidden sm:inline">Asisten Polyflow</span>
            </Button>
        </div>
    );
}
