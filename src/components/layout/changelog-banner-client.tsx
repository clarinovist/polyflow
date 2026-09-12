'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

/** Public routes must never render an internal release announcement. */
const PUBLIC_PATH_PREFIXES = [
    '/login',
    '/register',
    '/logout',
    '/terms',
    '/privacy',
    '/kiosk',
];

export function isPublicChangelogPath(pathname: string | null): boolean {
    if (!pathname || pathname === '/') return true;
    return PUBLIC_PATH_PREFIXES.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
}

interface ChangelogBannerClientProps {
    version: string;
    summaries: string[];
}

export function ChangelogBannerClient({
    version,
    summaries,
}: ChangelogBannerClientProps) {
    const pathname = usePathname();
    const isPublicPage = isPublicChangelogPath(pathname);
    const [isVisible, setIsVisible] = useState(false);
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [assistantOpen, setAssistantOpen] = useState(false);
    const visibleSummaries = summaries.slice(0, 3);
    const dismissalKey = `dismissed_changelog_${version}`;

    useEffect(() => {
        const handleAssistantOpen = () => {
            setDetailsOpen(false);
            setAssistantOpen(true);
        };
        const handleAssistantClose = () => setAssistantOpen(false);
        window.addEventListener('polyflow-assistant-open', handleAssistantOpen);
        window.addEventListener(
            'polyflow-assistant-close',
            handleAssistantClose,
        );
        return () => {
            window.removeEventListener(
                'polyflow-assistant-open',
                handleAssistantOpen,
            );
            window.removeEventListener(
                'polyflow-assistant-close',
                handleAssistantClose,
            );
        };
    }, []);

    useEffect(() => {
        if (isPublicPage) {
            setIsVisible(false);
            setDetailsOpen(false);
            return;
        }

        try {
            setIsVisible(localStorage.getItem(dismissalKey) !== 'true');
        } catch {
            // Storage can be unavailable in privacy-restricted browsers.
            setIsVisible(true);
        }
    }, [dismissalKey, isPublicPage]);

    const handleDismiss = () => {
        try {
            localStorage.setItem(dismissalKey, 'true');
        } catch {
            // Dismiss for this page even if persistence is unavailable.
        }
        setDetailsOpen(false);
        setIsVisible(false);
    };

    if (isPublicPage || !isVisible || assistantOpen) return null;

    return (
        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
            <aside
                aria-label="Pemberitahuan pembaruan"
                data-layout="in-flow"
                className="relative z-10 mx-auto my-2 flex w-fit max-w-[calc(100%-1rem)] flex-wrap items-center justify-center gap-2 rounded-full border border-primary/20 bg-background px-2 py-1.5 text-sm shadow-sm"
            >
                <Sparkles
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-primary"
                />
                <span className="font-medium">Pembaruan {version} tersedia</span>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 rounded-full px-2 text-xs"
                    aria-haspopup="dialog"
                    onClick={() => setDetailsOpen(true)}
                >
                    Lihat detail pembaruan
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 rounded-full"
                    aria-label="Tutup pemberitahuan pembaruan"
                    onClick={handleDismiss}
                >
                    <X aria-hidden="true" className="h-3.5 w-3.5" />
                </Button>
            </aside>

            <DialogContent showCloseButton={false} className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Pembaruan Polyflow {version}</DialogTitle>
                    <DialogDescription>
                        Ringkasan perubahan yang membantu pekerjaan Anda.
                    </DialogDescription>
                </DialogHeader>
                <ul className="list-disc space-y-2 pl-5 text-sm">
                    {visibleSummaries.map((summary) => (
                        <li key={summary}>{summary}</li>
                    ))}
                </ul>
                <div className="flex justify-end gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={handleDismiss}
                    >
                        Jangan tampilkan lagi
                    </Button>
                    <Button
                        type="button"
                        onClick={() => setDetailsOpen(false)}
                    >
                        Tutup
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
