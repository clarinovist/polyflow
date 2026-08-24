'use client';

import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * SSR-safe replacement for framer-motion's `useReducedMotion`.
 *
 * framer-motion's version reads `matchMedia` during the very first client
 * render. The server has no `matchMedia`, so it always renders the animated
 * markup — and a visitor with "Reduce motion" enabled gets a client render that
 * disagrees with the server HTML on the first pass, which React reports as a
 * hydration mismatch and recovers from by throwing away the tree.
 *
 * This hook always reports `false` for the server render AND the first client
 * render, so both sides produce identical HTML. The real preference is applied
 * in an effect, one paint later. The cost is a single extra render for users
 * who prefer reduced motion; the benefit is that hydration never mismatches.
 */
export function useReducedMotionSafe(): boolean {
    const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return;

        const mediaQuery = window.matchMedia(QUERY);
        setPrefersReducedMotion(mediaQuery.matches);

        const handleChange = (event: MediaQueryListEvent) =>
            setPrefersReducedMotion(event.matches);

        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, []);

    return prefersReducedMotion;
}
