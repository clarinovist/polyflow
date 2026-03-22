'use client';

import { useState, useEffect } from 'react';
import { X, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import DOMPurify from 'dompurify';

interface ChangelogBannerClientProps {
    version: string;
    notesHtml: string;
}

export function ChangelogBannerClient({ version, notesHtml }: ChangelogBannerClientProps) {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const dismissed = localStorage.getItem(`dismissed_changelog_${version}`);
        if (!dismissed) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setIsVisible(true);
        }
    }, [version]);

    if (!isVisible) return null;

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
                    <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full hover:bg-black/5 dark:hover:bg-white/10" onClick={handleDismiss}>
                        <X className="h-3 w-3" />
                    </Button>
                </div>
                <div className="p-4 text-xs text-muted-foreground max-h-64 overflow-y-auto">
                    <div className="space-y-1" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(notesHtml) }} />
                </div>
            </Card>
        </div>
    );
}
