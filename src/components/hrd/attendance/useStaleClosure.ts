'use client';

import { useCallback, useRef, useState } from 'react';
import {
    applyStaleSessionClosure,
    previewStaleSessionClosure,
} from '@/actions/hrd/stale-session-closure';
import type {
    ClosureApplyResult,
    ClosurePolicy,
    ClosurePreview,
} from './stale-closure-types';

export type ClosurePhase =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | {
          status: 'ready';
          preview: ClosurePreview;
          applyError: string | null;
          /** Server menolak karena data berubah: pratinjau harus dibuat ulang. */
          isOutdated: boolean;
      }
    | { status: 'applying'; preview: ClosurePreview }
    | { status: 'done'; preview: ClosurePreview; result: ClosureApplyResult };

interface PreviewRequest {
    recordIds: string[];
    policy: ClosurePolicy;
}

const PREVIEW_ERROR = 'Gagal membuat pratinjau koreksi';
const APPLY_ERROR = 'Gagal menerapkan koreksi';
const OUTDATED_PATTERN = /berubah sejak pratinjau/i;

const IDLE: ClosurePhase = { status: 'idle' };

function hasEligibleRow(preview: ClosurePreview): boolean {
    return preview.rows.some((r) => r.eligible);
}

function errorText(res: unknown, fallback: string): string {
    const message = (res as { error?: string }).error;
    return message || fallback;
}

/**
 * Alur pratinjau lalu terapkan koreksi massal. Penerapan mengirim semua id
 * yang dipratinjau beserta fingerprint-nya (server menutup hanya yang layak dan
 * menolak bila ada yang berubah); server tetap otoritas. Respons
 * pratinjau usang (permintaan lebih baru / dialog ditutup) diabaikan, dan
 * dialog tidak bisa ditutup saat penerapan berjalan. Status dibaca dari ref
 * sinkron supaya klik ganda tidak mengirim dua kali.
 */
export function useStaleClosure(onApplied: () => void) {
    const [phase, setPhase] = useState<ClosurePhase>(IDLE);
    const phaseRef = useRef<ClosurePhase>(IDLE);
    const latestRequest = useRef(0);
    const lastRequest = useRef<PreviewRequest | null>(null);

    const update = useCallback((next: ClosurePhase) => {
        phaseRef.current = next;
        setPhase(next);
    }, []);

    const runPreview = useCallback(
        async (request: PreviewRequest) => {
            const requestId = ++latestRequest.current;
            lastRequest.current = request;
            update({ status: 'loading' });
            let next: ClosurePhase;
            try {
                const res = await previewStaleSessionClosure(request);
                next =
                    res.success && 'data' in res && res.data
                        ? {
                              status: 'ready',
                              preview: res.data,
                              applyError: null,
                              isOutdated: false,
                          }
                        : {
                              status: 'error',
                              message: errorText(res, PREVIEW_ERROR),
                          };
            } catch {
                next = { status: 'error', message: PREVIEW_ERROR };
            }
            if (requestId === latestRequest.current) update(next);
        },
        [update],
    );

    const open = useCallback(
        (recordIds: string[], policy: ClosurePolicy) =>
            void runPreview({ recordIds, policy }),
        [runPreview],
    );

    const retry = useCallback(() => {
        if (lastRequest.current) void runPreview(lastRequest.current);
    }, [runPreview]);

    const close = useCallback(() => {
        if (phaseRef.current.status === 'applying') return;
        latestRequest.current += 1;
        update(IDLE);
    }, [update]);

    const apply = useCallback(async () => {
        const current = phaseRef.current;
        if (current.status !== 'ready') return;
        const { preview } = current;
        if (!hasEligibleRow(preview)) return;
        // Kirim SEMUA id yang dipratinjau: fingerprint server mencakup seluruh
        // id itu (termasuk yang tidak layak). Server hanya menutup yang layak
        // dan menolak bila ada yang berubah sejak pratinjau.
        const recordIds = preview.rows.map((r) => r.id);
        update({ status: 'applying', preview });
        try {
            const res = await applyStaleSessionClosure({
                recordIds,
                policy: preview.policy,
                fingerprint: preview.fingerprint,
            });
            if (res.success && 'data' in res && res.data) {
                update({ status: 'done', preview, result: res.data });
                onApplied();
                return;
            }
            const message = errorText(res, APPLY_ERROR);
            update({
                status: 'ready',
                preview,
                applyError: message,
                isOutdated: OUTDATED_PATTERN.test(message),
            });
        } catch {
            update({
                status: 'ready',
                preview,
                applyError: APPLY_ERROR,
                isOutdated: false,
            });
        }
    }, [update, onApplied]);

    return { phase, open, retry, close, apply };
}
