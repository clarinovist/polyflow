'use client';

import { useCallback, useMemo, useState } from 'react';
import type { StaleOpenSession } from '@/services/hrd/attendance-query-service';
import {
    CLOSURE_MAX_BATCH,
    DEFAULT_CLOSURE_POLICY,
    type ClosurePolicy,
} from './stale-closure-types';

/**
 * Pilihan baris + kebijakan untuk koreksi massal. Yang dihitung dan dikirim
 * hanyalah pilihan yang masih TAMPIL (selaras dengan pencarian dan daftar
 * terbaru), berurutan seperti daftar, dan tidak pernah melebihi batas batch.
 */
export function useStaleSelection(visible: StaleOpenSession[]) {
    const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
    const [policy, setPolicy] = useState<ClosurePolicy>(DEFAULT_CLOSURE_POLICY);

    const selectedIds = useMemo(
        () => visible.filter((s) => picked.has(s.id)).map((s) => s.id),
        [visible, picked],
    );
    const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
    const isSelected = useCallback((id: string) => selectedSet.has(id), [selectedSet]);
    const selectableCount = Math.min(visible.length, CLOSURE_MAX_BATCH);
    const isAtLimit = selectedIds.length >= CLOSURE_MAX_BATCH;
    const isAllSelected =
        selectableCount > 0 && selectedIds.length === selectableCount;

    const toggle = useCallback(
        (id: string) =>
            setPicked((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else if (!isAtLimit) next.add(id);
                return next;
            }),
        [isAtLimit],
    );

    const toggleAll = useCallback(
        () =>
            setPicked(
                isAllSelected
                    ? new Set()
                    : new Set(
                          visible.slice(0, CLOSURE_MAX_BATCH).map((s) => s.id),
                      ),
            ),
        [isAllSelected, visible],
    );

    return {
        selectedIds,
        isSelected,
        policy,
        setPolicy,
        isAtLimit,
        isAllSelected,
        toggle,
        toggleAll,
    };
}
