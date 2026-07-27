'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { MessageCircleHeart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { PolyflowChatPanel } from '@/components/support/polyflow-chat-panel';

const HIDDEN_PATH_PREFIXES = [
    '/login',
    '/register',
    '/kiosk',
    '/logout',
    '/api',
];
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

export function PolyflowChatWidget() {
    const pathname = usePathname();

    const shouldHide = useMemo(() => {
        if (!pathname) return true;
        if (HIDDEN_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix)))
            return true;
        return !ENABLED_PATH_PREFIXES.some(
            (prefix) => pathname.startsWith(prefix) || pathname === '/',
        );
    }, [pathname]);

    const isMobileRoute = useMemo(() => {
        if (!pathname) return false;
        return (
            pathname.startsWith('/warehouse/mobile') ||
            pathname.startsWith('/sales/mobile') ||
            pathname.startsWith('/field/sales') ||
            pathname.startsWith('/my')
        );
    }, [pathname]);

    if (shouldHide) {
        return null;
    }

    return (
        <div
            className={`fixed z-50 transition-all ${
                isMobileRoute
                    ? 'bottom-20 right-4 sm:bottom-5 sm:right-5'
                    : 'bottom-5 right-5'
            }`}
        >
            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        size="lg"
                        className="group h-11 w-11 p-0 sm:h-14 sm:w-auto sm:px-5 rounded-full bg-gradient-to-r from-cyan-600 via-teal-600 to-emerald-600 text-white shadow-[0_10px_30px_-10px_rgba(13,148,136,0.85)] transition hover:scale-[1.05] hover:from-cyan-500 hover:to-emerald-500 flex items-center justify-center"
                        title="Butuh bantuan?"
                        aria-label="Butuh bantuan?"
                    >
                        <MessageCircleHeart className="h-5 w-5 sm:mr-2 transition group-hover:rotate-6 shrink-0" />
                        <span className="hidden sm:inline">Butuh bantuan?</span>
                    </Button>
                </PopoverTrigger>

                <PopoverContent
                    side="top"
                    align="end"
                    sideOffset={16}
                    className="w-[calc(100vw-2.5rem)] sm:w-[400px] md:w-[420px] border-0 bg-transparent p-0 shadow-none"
                >
                    <PolyflowChatPanel />
                </PopoverContent>
            </Popover>
        </div>
    );
}
