'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Send, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { getMondayOfWeek } from '@/lib/sales/route-compliance';
import {
    getRouteWeekBoard,
    publishWeekRoutes,
} from '@/actions/sales/route-plans';
import { RouteCoverageBar } from './RouteCoverageBar';
import { RouteDayDrawer } from './RouteDayDrawer';

export type Rep = { id: string; name: string | null };
export type RouteCustomer = {
    id: string;
    name: string;
    code: string | null;
    city: string | null;
    latitude?: number | null;
    longitude?: number | null;
};

type WeekBoardPlanCell = {
    userId: string;
    planId: string | null;
    status: string | null;
    itemCount: number;
    visitedCount: number;
};
type WeekBoardDay = { date: string; plans: WeekBoardPlanCell[] };
type WeekBoardOverdue = {
    customerId: string;
    name: string;
    lastVisitAt: string | null;
    daysSince: number | null;
};
type WeekBoardConflict = {
    customerId: string;
    name: string;
    date: string;
    userIds: string[];
};
export type RouteWeekBoard = {
    days: WeekBoardDay[];
    coverage: { activeCustomers: number; scheduledThisWeek: number };
    overdue: WeekBoardOverdue[];
    conflicts: WeekBoardConflict[];
    /** Umur kunjungan untuk SEMUA customer aktif (superset dari `overdue`) —
     * dialirkan ke RouteDayDrawer untuk badge per stop (R6), tanpa query baru. */
    lastVisits: WeekBoardOverdue[];
};

export type VisitAgeInfo = {
    lastVisitAt: string | null;
    daysSince: number | null;
};

type WeeklyRouteBoardProps = {
    team: Rep[];
    customers: RouteCustomer[];
    initialWeekStart: string;
    initialBoard: RouteWeekBoard;
};

const WEEKDAY_LABELS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

function addDaysISO(iso: string, days: number): string {
    const d = new Date(`${iso}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().split('T')[0];
}

function todayISO(): string {
    return new Date().toISOString().split('T')[0];
}

export function WeeklyRouteBoard({
    team,
    customers,
    initialWeekStart,
    initialBoard,
}: WeeklyRouteBoardProps) {
    const [weekStart, setWeekStart] = useState(initialWeekStart);
    const [board, setBoard] = useState<RouteWeekBoard>(initialBoard);
    const [loading, setLoading] = useState(false);
    const [drawer, setDrawer] = useState<{
        date: string;
        userId: string;
    } | null>(null);
    const [highlightedConflictDate, setHighlightedConflictDate] = useState<
        string | null
    >(null);

    const userIds = team.map((t) => t.id);
    const isFirstRender = useRef(true);
    const today = todayISO();

    const fetchBoard = useCallback(async () => {
        if (userIds.length === 0) return;
        setLoading(true);
        try {
            const result = await getRouteWeekBoard(weekStart, userIds);
            if (result?.success) {
                setBoard(result.data as RouteWeekBoard);
            } else {
                toast.error('Gagal memuat papan rute minggu ini');
            }
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [weekStart, JSON.stringify(userIds)]);

    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }
        void fetchBoard();
    }, [fetchBoard]);

    // R6: umur kunjungan per customer, dari data yang sama dengan overdue
    // (tidak ada query tambahan) — dialirkan ke drawer sebagai lookup O(1).
    const lastVisitByCustomer = useMemo(() => {
        const map = new Map<string, VisitAgeInfo>();
        for (const v of board.lastVisits) {
            map.set(v.customerId, {
                lastVisitAt: v.lastVisitAt,
                daysSince: v.daysSince,
            });
        }
        return map;
    }, [board.lastVisits]);

    function goToWeek(offsetDays: number) {
        setWeekStart((prev) => addDaysISO(prev, offsetDays));
    }

    function goToCurrentWeek() {
        setWeekStart(getMondayOfWeek(new Date()).toISOString().split('T')[0]);
    }

    const draftCount = board.days.reduce(
        (sum, day) =>
            sum + day.plans.filter((p) => p.status === 'DRAFT').length,
        0,
    );

    async function handlePublishWeek() {
        const result = await publishWeekRoutes(weekStart, userIds);
        if (result?.success) {
            const count = (result.data as { count: number }).count;
            toast.success(`${count} rute dipublikasikan`);
            void fetchBoard();
        } else {
            toast.error(
                (result as { error?: string })?.error ||
                    'Gagal mempublikasikan minggu ini',
            );
        }
    }

    const repById = new Map(team.map((r) => [r.id, r]));
    const weekRangeLabel = board.days.length
        ? `${new Date(board.days[0].date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} — ${new Date(board.days[board.days.length - 1].date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`
        : '';

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center border rounded-md bg-background overflow-hidden">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 rounded-none border-r"
                        onClick={() => goToWeek(-7)}
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="px-4 py-1.5 min-w-[180px] text-center text-sm font-medium">
                        {weekRangeLabel}
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 rounded-none border-l"
                        onClick={() => goToWeek(7)}
                    >
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
                <Button variant="outline" size="sm" onClick={goToCurrentWeek}>
                    Minggu Ini
                </Button>

                <div className="ml-auto">
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button size="sm" disabled={draftCount === 0}>
                                <Send className="h-4 w-4 mr-1.5" />
                                Terbitkan Minggu Ini
                                {draftCount > 0 && ` (${draftCount})`}
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>
                                    Terbitkan {draftCount} rute DRAFT?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                    Semua rute berstatus DRAFT pada minggu ini (
                                    {weekRangeLabel}) akan dipublikasikan
                                    sekaligus dan bisa langsung dijalankan sales
                                    rep.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Batal</AlertDialogCancel>
                                <AlertDialogAction onClick={handlePublishWeek}>
                                    Terbitkan
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </div>

            <RouteCoverageBar
                coverage={board.coverage}
                overdue={board.overdue}
                conflicts={board.conflicts}
                onConflictClick={(c) =>
                    setHighlightedConflictDate(
                        c.date.split('T')[0] === highlightedConflictDate
                            ? null
                            : c.date.split('T')[0],
                    )
                }
            />

            <div className="border rounded-lg overflow-x-auto">
                <table className="w-full text-sm border-collapse min-w-[720px]">
                    <thead>
                        <tr className="border-b bg-muted/40">
                            <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground w-40">
                                Sales Rep
                            </th>
                            {board.days.map((day, idx) => {
                                const dateOnly = day.date.split('T')[0];
                                return (
                                    <th
                                        key={day.date}
                                        className={`px-2 py-2 font-medium text-xs text-center ${
                                            dateOnly === today
                                                ? 'bg-primary/10 text-primary'
                                                : 'text-muted-foreground'
                                        }`}
                                    >
                                        {WEEKDAY_LABELS[idx]}
                                        <br />
                                        {new Date(day.date).toLocaleDateString(
                                            'id-ID',
                                            { day: 'numeric', month: 'short' },
                                        )}
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {team.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={7}
                                    className="p-8 text-center text-sm text-muted-foreground"
                                >
                                    Belum ada anggota tim sales/marketing.
                                </td>
                            </tr>
                        ) : (
                            team.map((rep) => (
                                <tr
                                    key={rep.id}
                                    className="border-b last:border-0"
                                >
                                    <td className="px-3 py-2 text-xs font-medium truncate max-w-[160px]">
                                        {rep.name ??
                                            repById.get(rep.id)?.name ??
                                            '-'}
                                    </td>
                                    {board.days.map((day) => {
                                        const cell = day.plans.find(
                                            (p) => p.userId === rep.id,
                                        );
                                        const dateOnly = day.date.split('T')[0];
                                        const hasConflict =
                                            board.conflicts.some(
                                                (c) =>
                                                    c.date.split('T')[0] ===
                                                        dateOnly &&
                                                    c.userIds.includes(rep.id),
                                            );
                                        const isHighlighted =
                                            highlightedConflictDate ===
                                            dateOnly;
                                        return (
                                            <td
                                                key={`${rep.id}-${day.date}`}
                                                className="p-1.5 text-center"
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setDrawer({
                                                            date: dateOnly,
                                                            userId: rep.id,
                                                        })
                                                    }
                                                    className={`w-full min-h-[52px] rounded-md border flex flex-col items-center justify-center gap-0.5 text-xs transition-colors hover:bg-muted/60 ${
                                                        hasConflict
                                                            ? 'border-destructive/60'
                                                            : ''
                                                    } ${isHighlighted ? 'ring-2 ring-destructive' : ''}`}
                                                >
                                                    {cell && cell.planId ? (
                                                        <>
                                                            <span className="font-semibold">
                                                                {
                                                                    cell.visitedCount
                                                                }
                                                                /
                                                                {cell.itemCount}
                                                            </span>
                                                            <Badge
                                                                variant={
                                                                    cell.status ===
                                                                    'PUBLISHED'
                                                                        ? 'default'
                                                                        : 'secondary'
                                                                }
                                                                className="text-[9px] px-1.5 py-0"
                                                            >
                                                                {cell.status}
                                                            </Badge>
                                                        </>
                                                    ) : (
                                                        <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                                                    )}
                                                    {hasConflict && (
                                                        <span className="text-[9px] text-destructive font-medium">
                                                            BENTROK
                                                        </span>
                                                    )}
                                                </button>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
            {loading && (
                <p className="text-xs text-muted-foreground">Memuat...</p>
            )}

            <RouteDayDrawer
                open={drawer !== null}
                onOpenChange={(open) => {
                    if (!open) setDrawer(null);
                }}
                date={drawer?.date ?? null}
                userId={drawer?.userId ?? null}
                repName={(drawer && repById.get(drawer.userId)?.name) || 'Rep'}
                allCustomers={customers}
                conflictCustomerIds={
                    new Set(
                        board.conflicts
                            .filter(
                                (c) =>
                                    drawer &&
                                    c.date.split('T')[0] === drawer.date &&
                                    c.userIds.includes(drawer.userId),
                            )
                            .map((c) => c.customerId),
                    )
                }
                lastVisitByCustomer={lastVisitByCustomer}
                onSaved={() => void fetchBoard()}
            />
        </div>
    );
}
