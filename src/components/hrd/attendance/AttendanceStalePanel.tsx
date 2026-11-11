'use client';

import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { StaleOpenSession } from '@/services/hrd/attendance-query-service';
import { AttendanceLoadError } from './AttendanceLoadError';
import { formatTime } from './attendance-format';
import { STALE_FILTER_LABEL } from './attendance-recap-helpers';
import type { StaleSessionsState } from './useStaleOpenSessions';

export type { StaleSessionsState } from './useStaleOpenSessions';

const PANEL_TITLE = 'Sesi belum pulang';
const EMPTY_TEXT = 'Tidak ada sesi yang belum pulang';
const NO_MATCH_TEXT = 'Tidak ada karyawan yang cocok dengan pencarian.';
const TRUNCATED_TEXT =
    'Daftar dibatasi pada sesi terbaru; sebagian sesi lebih lama tidak ditampilkan. Koreksi sebagian lalu muat ulang untuk melihat sisanya.';
const SCOPE_HINT =
    'Sesi tanpa jam pulang lebih dari 20 jam (60 hari terakhir, tidak mengikuti tanggal di atas). Upah sesi ini Rp0 sampai jam pulang dikoreksi.';

interface Props {
    state: StaleSessionsState;
    /** Pencarian nama/kode dari filter rekap. */
    query: string;
    onRetry: () => void;
    onCorrect: (session: StaleOpenSession) => void;
}

function matchesQuery(session: StaleOpenSession, query: string): boolean {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return (
        session.employeeName.toLowerCase().includes(needle) ||
        session.employeeCode.toLowerCase().includes(needle)
    );
}

/** `YYYY-MM-DD` menjadi "9 Nov 2026" (tanggal kalender, tanpa konversi zona). */
function formatWorkDate(workDate: string): string {
    return new Date(`${workDate}T00:00:00.000Z`).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
    });
}

function formatOpenHours(hours: number): string {
    return `Terbuka ${hours.toLocaleString('id-ID')} jam`;
}

function PanelMessage({ children }: { children: React.ReactNode }) {
    return (
        <div className="bg-card rounded-xl border p-8 text-center text-muted-foreground">
            {children}
        </div>
    );
}

function LoadingSkeleton() {
    return (
        <div
            role="status"
            aria-busy="true"
            className="bg-card rounded-xl border p-4 space-y-3"
        >
            <span className="sr-only">Memuat daftar sesi belum pulang…</span>
            {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
            ))}
        </div>
    );
}

interface RowProps {
    session: StaleOpenSession;
    onCorrect: (session: StaleOpenSession) => void;
}

function StaleRow({ session, onCorrect }: RowProps) {
    const { shift } = session;
    return (
        <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0 space-y-0.5">
                <p className="font-medium truncate">{session.employeeName}</p>
                <p className="text-xs text-muted-foreground">
                    <span>{session.employeeCode}</span>
                    {' · '}
                    <span>
                        {shift.name} ({shift.startTime}–{shift.endTime})
                    </span>
                </p>
                <p className="text-xs text-muted-foreground">
                    {formatWorkDate(session.workDate)}
                    {' · masuk '}
                    {formatTime(session.clockInAt)}
                </p>
            </div>
            <div className="flex items-center gap-2">
                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600">
                    {STALE_FILTER_LABEL}
                </span>
                <span className="text-xs font-medium text-muted-foreground">
                    {formatOpenHours(session.openHours)}
                </span>
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onCorrect(session)}
                >
                    Koreksi jam
                </Button>
            </div>
        </li>
    );
}

/** Daftar "Sesi belum pulang" (lupa pulang) dengan tombol Koreksi jam per baris. */
export function AttendanceStalePanel({
    state,
    query,
    onRetry,
    onCorrect,
}: Props) {
    const sessions = useMemo(
        () =>
            state.status === 'ready'
                ? state.data.sessions.filter((s) => matchesQuery(s, query))
                : [],
        [state, query],
    );

    if (state.status === 'loading') return <LoadingSkeleton />;
    if (state.status === 'error') {
        return (
            <AttendanceLoadError message={state.message} onRetry={onRetry} />
        );
    }
    if (state.data.sessions.length === 0) {
        return <PanelMessage>{EMPTY_TEXT}</PanelMessage>;
    }

    return (
        <section className="space-y-2" aria-label={PANEL_TITLE}>
            <div>
                <h2 className="text-sm font-semibold">
                    {PANEL_TITLE}{' '}
                    <span className="font-normal text-muted-foreground">
                        · {state.data.sessions.length} sesi
                    </span>
                </h2>
                <p className="text-xs text-muted-foreground">{SCOPE_HINT}</p>
            </div>
            {state.data.truncated && (
                <p role="note" className="text-xs text-amber-600">
                    {TRUNCATED_TEXT}
                </p>
            )}
            {sessions.length === 0 ? (
                <PanelMessage>{NO_MATCH_TEXT}</PanelMessage>
            ) : (
                <ul className="bg-card rounded-xl border divide-y max-h-[32rem] overflow-y-auto">
                    {sessions.map((s) => (
                        <StaleRow
                            key={s.id}
                            session={s}
                            onCorrect={onCorrect}
                        />
                    ))}
                </ul>
            )}
        </section>
    );
}
