'use client';

import type { MouseEvent } from 'react';

export function SkipToMainContent() {
    const focusMainContent = (event: MouseEvent<HTMLAnchorElement>) => {
        const mainContent = document.getElementById('main-content');
        if (!mainContent) return;

        event.preventDefault();
        mainContent.focus();
    };

    return (
        <a
            href="#main-content"
            onClick={focusMainContent}
            className="fixed left-4 top-4 z-[100] -translate-y-24 rounded-md bg-background px-4 py-2 text-sm font-medium text-foreground shadow-lg ring-2 ring-ring transition-transform focus:translate-y-0"
        >
            Lewati ke konten utama
        </a>
    );
}
