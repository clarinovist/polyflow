'use client';

import { useEffect, useRef, useState } from 'react';

export const PRESENCE_TICK_MS = 15_000;
export const BREAK_ACTIVE_MS = 60 * 60_000;
const HELP_ACTIVE_MS = 2 * 60_000;
type Preferences = { help: boolean; breaks: boolean };
type Offer = 'help' | 'break' | 'joke' | null;

export function assistantPageGuide(pathname: string): string | null {
    if (pathname === '/purchasing/orders/create') return null;
    if (/^\/purchasing\/orders(?:\/|$)/.test(pathname))
        return '/support/cara-menutup-po-diterima-sebagian';
    if (pathname === '/finance/returns/create')
        return '/support/cara-retur-dan-potong-tagihan';
    if (/^\/(finance|sales)\/returns(?:\/|$)/.test(pathname))
        return '/support/cara-retur-penjualan-dan-kredit-finance';
    return null;
}
function read(key: string): string | null {
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}
function store(key: string, value: string) {
    try {
        window.localStorage.setItem(key, value);
    } catch {
        /* consent remains session-only */
    }
}
function blocked() {
    const editing = document.activeElement?.closest(
        'input, textarea, select, [contenteditable="true"], [role="textbox"]',
    );
    const overlay = [
        ...document.querySelectorAll(
            '[role="dialog"][data-state="open"], [role="alertdialog"], [role="alert"], [aria-busy="true"]',
        ),
    ].some(
        (node) => !node.closest('[hidden]') && node.getClientRects().length > 0,
    );
    return (
        document.visibilityState !== 'visible' ||
        !document.hasFocus() ||
        !!editing ||
        overlay ||
        !!document.querySelector(
            '#polyflow-assistant-dialog [aria-busy="true"]',
        )
    );
}

/** Stores consent/day stamps only. No messages, page content, business data or AI polling. */
export function useAssistantPresence(
    userId: string,
    pathname: string,
    chatOpen: boolean,
) {
    const key = `polyflow:assistant-presence:v1:${userId}`;
    const [preferences, setPreferences] = useState<Preferences>(() => {
        try {
            const saved = JSON.parse(read(key) ?? '{}');
            return { help: saved.help === true, breaks: saved.breaks === true };
        } catch {
            return { help: false, breaks: false };
        }
    });
    const [offer, setOffer] = useState<Offer>(null);
    const activeTime = useRef(0);
    const offeredDay = useRef<string | null>(null);
    const guide = assistantPageGuide(pathname);
    const update = (next: Preferences) => {
        setPreferences(next);
        store(key, JSON.stringify(next));
        setOffer(null);
    };
    const dismiss = () => setOffer(null);

    useEffect(() => {
        setOffer(null);
        if (chatOpen || (!preferences.help && !preferences.breaks)) return;
        let pageActiveMs = 0;
        let lastActivity = 0; // A background/restored tab is not active work.
        const onActivity = (event: Event) => {
            lastActivity = Date.now();
            const insideOffer = (event.target as Element | null)?.closest?.(
                '[aria-label="Sapaan Asisten"]',
            );
            if (!insideOffer || blocked()) setOffer(null);
        };
        const onVisibility = () => {
            lastActivity = 0;
            setOffer(null);
        };
        const onStorage = (event: StorageEvent) => {
            if (event.key === key) {
                try {
                    const next = JSON.parse(event.newValue ?? '{}');
                    setPreferences({
                        help: next.help === true,
                        breaks: next.breaks === true,
                    });
                } catch {
                    setPreferences({ help: false, breaks: false });
                }
            }
            if (event.key?.startsWith(`${key}:`)) setOffer(null);
        };
        const timer = window.setInterval(() => {
            if (
                document.visibilityState !== 'visible' ||
                !document.hasFocus()
            ) {
                setOffer(null);
                return;
            }
            const idle = Date.now() - lastActivity;
            if (!lastActivity || idle > 60_000) return;
            activeTime.current += PRESENCE_TICK_MS;
            pageActiveMs += PRESENCE_TICK_MS;
            if (blocked()) {
                setOffer(null);
                return;
            }
            if (idle < 5_000) return;
            const day = new Date().toLocaleDateString('en-CA');
            const kind =
                preferences.breaks && activeTime.current >= BREAK_ACTIVE_MS
                    ? 'break'
                    : preferences.help &&
                        guide &&
                        pageActiveMs >= HELP_ACTIVE_MS
                      ? 'help'
                      : null;
            // At most one offer of either type per local day, also across tabs.
            if (
                !kind ||
                offeredDay.current === day ||
                read(`${key}:day`) === day
            )
                return;
            offeredDay.current = day;
            store(`${key}:day`, day);
            setOffer(kind);
        }, PRESENCE_TICK_MS);
        for (const event of ['pointerdown', 'keydown', 'scroll'])
            window.addEventListener(event, onActivity, { passive: true });
        window.addEventListener('focusin', onActivity);
        window.addEventListener('blur', onVisibility);
        window.addEventListener('storage', onStorage);
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            clearInterval(timer);
            for (const event of ['pointerdown', 'keydown', 'scroll'])
                window.removeEventListener(event, onActivity);
            window.removeEventListener('focusin', onActivity);
            window.removeEventListener('blur', onVisibility);
            window.removeEventListener('storage', onStorage);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [key, preferences.help, preferences.breaks, guide, pathname, chatOpen]);

    return {
        preferences,
        update,
        offer,
        guide,
        dismiss,
        showJoke: () => setOffer('joke'),
        disable: () => update({ help: false, breaks: false }),
    };
}
