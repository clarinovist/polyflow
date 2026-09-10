'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type HistoryMessage = {
    id: string;
    role: 'user' | 'assistant';
    text: string;
};
export type HistoryItem = {
    id: string;
    title: string;
    lastMessageAt: string;
    pathname: string;
    profile: 'general' | 'finance' | 'production';
};
type Conversation = {
    id: string;
    pathname: string;
    canContinue: boolean;
    messages: HistoryMessage[];
    nextOffset: number | null;
};
type HistoryResult = {
    conversations?: HistoryItem[];
    nextOffset?: number | null;
    conversation?: Conversation | null;
    error?: string;
};
type Request = {
    mode: 'latest' | 'list' | 'detail';
    conversationId?: string;
    offset?: number;
};

/** Server is the only history store; no transcripts or credentials in web storage. */
export function useAssistantHistory(
    pathname: string,
    onRestore: (conversation: Conversation, prepend: boolean) => void,
) {
    const callback = useRef(onRestore);
    useEffect(() => {
        callback.current = onRestore;
    }, [onRestore]);
    const controller = useRef<AbortController | null>(null);
    const [busy, setBusy] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [items, setItems] = useState<HistoryItem[]>([]);
    const [show, setShow] = useState(false);
    const [nextOffset, setNextOffset] = useState<number | null>(null);
    const [selected, setSelected] = useState<Conversation | null>(null);
    const retry = useRef<Request>({ mode: 'latest' });

    const load = useCallback(
        async (request: Request) => {
            controller.current?.abort();
            const active = new AbortController();
            controller.current = active;
            retry.current = request;
            setBusy(true);
            setError(null);
            if (request.mode === 'list' && !request.offset) setItems([]);
            try {
                const params = new URLSearchParams({
                    mode: request.mode,
                    pathname,
                });
                if (request.conversationId)
                    params.set('conversationId', request.conversationId);
                if (request.offset)
                    params.set('offset', String(request.offset));
                const response = await fetch(`/api/chat/history?${params}`, {
                    cache: 'no-store',
                    signal: active.signal,
                });
                const data: HistoryResult = await response.json();
                if (active.signal.aborted) return;
                if (!response.ok)
                    throw new Error(
                        data.error || 'Riwayat belum dapat dimuat.',
                    );
                if (request.mode === 'list') {
                    setItems((old) =>
                        request.offset
                            ? [...old, ...(data.conversations ?? [])]
                            : (data.conversations ?? []),
                    );
                    setNextOffset(data.nextOffset ?? null);
                } else if (data.conversation) {
                    setSelected(data.conversation);
                    callback.current(data.conversation, !!request.offset);
                    setShow(false);
                }
            } catch (error) {
                if (!active.signal.aborted)
                    setError(
                        error instanceof Error
                            ? error.message
                            : 'Riwayat belum dapat dimuat.',
                    );
            } finally {
                if (!active.signal.aborted) setBusy(false);
            }
        },
        [pathname],
    );

    useEffect(() => {
        setSelected(null);
        setShow(false);
        setItems([]);
        void load({ mode: 'latest' });
        return () => controller.current?.abort();
    }, [load]);

    const reset = () => {
        controller.current?.abort();
        setBusy(false);
        setSelected(null);
        setShow(false);
        setError(null);
    };
    return {
        busy,
        error,
        items,
        show,
        selected,
        nextOffset,
        reset,
        open: () => {
            setShow(true);
            void load({ mode: 'list' });
        },
        close: () => {
            controller.current?.abort();
            setBusy(false);
            setError(null);
            setShow(false);
        },
        retry: () => void load(retry.current),
        more: () => {
            if (nextOffset !== null)
                void load({ mode: 'list', offset: nextOffset });
        },
        select: (id: string) =>
            void load({ mode: 'detail', conversationId: id }),
        older: () => {
            if (selected?.nextOffset != null)
                void load({
                    mode: 'detail',
                    conversationId: selected.id,
                    offset: selected.nextOffset,
                });
        },
    };
}
