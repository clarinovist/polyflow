'use client';

import { useState } from 'react';
import {
    Target,
    AlertTriangle,
    Users2,
    ChevronDown,
    ChevronUp,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

// Bentuk sudah lewat serializeData (dipanggil di action) — tanggal berupa
// string ISO, bukan Date. Sengaja tidak import type dari
// route-planning-service.ts: file itu meng-import `prisma` di top-level dan
// tidak boleh masuk bundle client component.
type CoverageStat = { activeCustomers: number; scheduledThisWeek: number };
type OverdueEntry = {
    customerId: string;
    name: string;
    lastVisitAt: string | null;
    daysSince: number | null;
};
type ConflictEntry = {
    customerId: string;
    name: string;
    date: string;
    userIds: string[];
};

type RouteCoverageBarProps = {
    coverage: CoverageStat;
    overdue: OverdueEntry[];
    conflicts: ConflictEntry[];
    onConflictClick?: (conflict: ConflictEntry) => void;
};

/**
 * Bar cakupan minggu: total customer aktif vs terjadwal, daftar overdue
 * (klik untuk expand), dan daftar bentrok (klik salah satu untuk sorot sel
 * terkait di WeeklyRouteBoard).
 */
export function RouteCoverageBar({
    coverage,
    overdue,
    conflicts,
    onConflictClick,
}: RouteCoverageBarProps) {
    const [showOverdue, setShowOverdue] = useState(false);
    const [showConflicts, setShowConflicts] = useState(false);

    const coveragePercent =
        coverage.activeCustomers === 0
            ? 0
            : Math.round(
                  (coverage.scheduledThisWeek / coverage.activeCustomers) * 100,
              );

    return (
        <div className="rounded-lg border bg-muted/30 text-xs">
            <div className="flex flex-wrap items-center gap-4 px-3 py-2">
                <div
                    className="flex items-center gap-1.5"
                    title="Customer aktif yang di-assign ke rep pada tampilan ini, dan berapa yang sudah terjadwal minggu ini"
                >
                    <Target className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-semibold">
                        {coverage.scheduledThisWeek}/{coverage.activeCustomers}
                    </span>
                    <span className="text-muted-foreground">
                        cakupan minggu ({coveragePercent}%)
                    </span>
                </div>

                <button
                    type="button"
                    onClick={() => setShowOverdue((v) => !v)}
                    disabled={overdue.length === 0}
                    className="flex items-center gap-1.5 disabled:opacity-40"
                >
                    <Users2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-semibold">{overdue.length}</span>
                    <span className="text-muted-foreground">
                        overdue (&gt;30 hari)
                    </span>
                    {overdue.length > 0 &&
                        (showOverdue ? (
                            <ChevronUp className="h-3 w-3" />
                        ) : (
                            <ChevronDown className="h-3 w-3" />
                        ))}
                </button>

                {conflicts.length > 0 && (
                    <button
                        type="button"
                        onClick={() => setShowConflicts((v) => !v)}
                        className="flex items-center gap-1.5"
                    >
                        <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                        <span className="font-semibold text-destructive">
                            {conflicts.length}
                        </span>
                        <span className="text-muted-foreground">bentrok</span>
                        {showConflicts ? (
                            <ChevronUp className="h-3 w-3" />
                        ) : (
                            <ChevronDown className="h-3 w-3" />
                        )}
                    </button>
                )}
            </div>

            {showOverdue && overdue.length > 0 && (
                <div className="border-t px-3 py-2 space-y-1.5 max-h-48 overflow-y-auto">
                    {overdue.map((o) => (
                        <div
                            key={o.customerId}
                            className="flex items-center justify-between gap-2"
                        >
                            <span className="truncate">{o.name}</span>
                            <Badge
                                variant="outline"
                                className="text-[10px] shrink-0"
                            >
                                {o.daysSince === null
                                    ? 'Belum pernah'
                                    : `${o.daysSince} hari`}
                            </Badge>
                        </div>
                    ))}
                </div>
            )}

            {showConflicts && conflicts.length > 0 && (
                <div className="border-t px-3 py-2 space-y-1.5 max-h-48 overflow-y-auto">
                    {conflicts.map((c, idx) => (
                        <button
                            key={`${c.customerId}-${idx}`}
                            type="button"
                            onClick={() => onConflictClick?.(c)}
                            className="w-full flex items-center justify-between gap-2 text-left hover:bg-background rounded px-1 -mx-1"
                        >
                            <span className="truncate">
                                {c.name} ·{' '}
                                {new Date(c.date).toLocaleDateString('id-ID', {
                                    weekday: 'short',
                                    day: 'numeric',
                                    month: 'short',
                                })}
                            </span>
                            <Badge
                                variant="destructive"
                                className="text-[10px] shrink-0"
                            >
                                {c.userIds.length} rep
                            </Badge>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
