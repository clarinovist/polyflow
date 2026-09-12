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
            // globals.css uses this sentinel to append one bounded safe-area
            // spacer to main; no per-control measurement or observers needed.
            data-polyflow-chat-fab=""
            data-desktop-safe-area={mobile ? undefined : ''}
            className={`fixed z-50 print:hidden ${
                mobile
                    ? 'bottom-20 right-4 sm:bottom-5 sm:right-5'
                    : 'bottom-5 right-5'
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
                    className="absolute bottom-full right-0 mb-4 w-[calc(100vw-2.5rem)] sm:w-[400px] md:w-[420px] outline-none"
                >
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        aria-label="Minimize asisten"
                        className="absolute -top-3 right-3 z-10 h-7 rounded-full shadow"
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
