import { useCallback, useEffect, useRef, useState } from 'react';

/** Guard explicit navigation and document links without patching Next router/history. */
export function useUnsavedSpk() {
    const [dirty, setDirty] = useState(false);
    const [prompt, setPrompt] = useState<string | null>(null);
    const pending = useRef<(() => void) | null>(null);
    const saved = useRef(false);
    const markDirty = useCallback(() => {
        saved.current = false;
        setDirty(true);
    }, []);
    const markSaved = useCallback(() => {
        saved.current = true;
        setDirty(false);
    }, []);
    const request = useCallback(
        (
            action: () => void,
            message = 'Perubahan SPK belum disimpan. Keluar dari formulir?',
        ) => {
            if (!dirty || saved.current) {
                action();
                return;
            }
            pending.current = action;
            setPrompt(message);
        },
        [dirty],
    );
    const cancel = useCallback(() => {
        pending.current = null;
        setPrompt(null);
    }, []);
    const confirm = useCallback(() => {
        const action = pending.current;
        pending.current = null;
        setPrompt(null);
        action?.();
    }, []);

    useEffect(() => {
        if (!dirty) return;
        const beforeUnload = (event: BeforeUnloadEvent) => {
            if (saved.current) return;
            event.preventDefault();
            event.returnValue = '';
        };
        const click = (event: MouseEvent) => {
            if (
                saved.current ||
                event.defaultPrevented ||
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.altKey ||
                event.shiftKey
            )
                return;
            const anchor = (event.target as Element)?.closest?.(
                'a[href]',
            ) as HTMLAnchorElement | null;
            if (
                !anchor ||
                anchor.hasAttribute('download') ||
                (anchor.target && anchor.target !== '_self')
            )
                return;
            const next = new URL(anchor.href, window.location.href);
            if (
                !['http:', 'https:'].includes(next.protocol) ||
                (next.pathname === location.pathname &&
                    next.search === location.search &&
                    next.origin === location.origin)
            )
                return;
            event.preventDefault();
            event.stopPropagation();
            request(() => {
                saved.current = true;
                window.location.assign(next.href);
            });
        };
        window.addEventListener('beforeunload', beforeUnload);
        document.addEventListener('click', click, true);
        return () => {
            window.removeEventListener('beforeunload', beforeUnload);
            document.removeEventListener('click', click, true);
        };
    }, [dirty, request]);

    return { dirty, markDirty, markSaved, request, prompt, cancel, confirm };
}
