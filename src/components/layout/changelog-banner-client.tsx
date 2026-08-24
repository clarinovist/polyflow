'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { X, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import DOMPurify from 'dompurify';

const CHANGELOG_SANITIZE_CONFIG = {
    ALLOWED_TAGS: ['h3', 'strong', 'li', 'br'],
    ALLOWED_ATTR: ['class'],
    ALLOW_DATA_ATTR: false,
};

/**
 * Routes that anonymous visitors can reach. The changelog is an internal release
 * note — it names unreleased modules, internal phases, and links the private repo —
 * so it must never render on a public surface.
 *
 * `/` is the marketing landing page and is matched exactly, not by prefix:
 * a prefix match on '/' would suppress the banner everywhere.
 */
const PUBLIC_PATH_PREFIXES = [
    '/login',
    '/register',
    '/logout',
    '/terms',
    '/privacy',
    '/kiosk',
];

export function isPublicChangelogPath(pathname: string | null): boolean {
    if (!pathname) return true;
    if (pathname === '/') return true;
    return PUBLIC_PATH_PREFIXES.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
}

interface ChangelogBannerClientProps {
    version: string;
    notesHtml: string;
}

export function ChangelogBannerClient({
    version,
    notesHtml,
}: ChangelogBannerClientProps) {
    const pathname = usePathname();
    const isPublicPage = isPublicChangelogPath(pathname);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (isPublicPage) {
            setIsVisible(false);
            return;
        }
        const dismissed = localStorage.getItem(
            `dismissed_changelog_${version}`,
        );
        if (!dismissed) {
            setIsVisible(true);
        }
    }, [version, isPublicPage]);

    if (isPublicPage || !isVisible) return null;

    const handleDismiss = () => {
        localStorage.setItem(`dismissed_changelog_${version}`, 'true');
        setIsVisible(false);
    };

    return (
        <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-5 fade-in duration-500">
            <Card className="w-80 shadow-2xl border-primary/20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 overflow-hidden">
                <div className="bg-primary/10 px-4 py-2.5 flex items-center justify-between border-b border-primary/10">
                    <div className="flex items-center gap-2 text-primary font-semibold text-sm">
                        <Sparkles className="h-4 w-4" />
                        <span>What&apos;s New in {version}</span>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 rounded-full hover:bg-black/5 dark:hover:bg-white/10"
                        onClick={handleDismiss}
                    >
                        <X className="h-3 w-3" />
                    </Button>
                </div>
                <div className="p-4 text-xs text-muted-foreground max-h-64 overflow-y-auto">
                    {/* notesHtml comes from local CHANGELOG.md parser and is sanitized before render as defense-in-depth */}
                    <div
                        className="space-y-1"
                        dangerouslySetInnerHTML={{
                            __html: DOMPurify.sanitize(
                                notesHtml,
                                CHANGELOG_SANITIZE_CONFIG,
                            ),
                        }}
                    />
                </div>
            </Card>
        </div>
    );
}
