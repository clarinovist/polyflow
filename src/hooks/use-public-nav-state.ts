'use client';

import { useEffect, useRef, useState } from 'react';

const SCROLLED_THRESHOLD = 20;

export function usePublicNavState() {
    const [scrolled, setScrolled] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const mobileMenuButton = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const handleScroll = () =>
            setScrolled(window.scrollY > SCROLLED_THRESHOLD);

        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    useEffect(() => {
        if (!mobileOpen) return;

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;

            event.preventDefault();
            setMobileOpen(false);
            mobileMenuButton.current?.focus();
        };

        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [mobileOpen]);

    return { scrolled, mobileOpen, setMobileOpen, mobileMenuButton };
}
