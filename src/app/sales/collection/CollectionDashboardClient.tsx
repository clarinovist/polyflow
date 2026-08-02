'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatRupiah, toDecimalNumber } from '@/lib/utils/utils';
import {
    getSalesArAgingAction,
    getInvoicesWithoutCollectionActivityAction,
} from '@/actions/sales/collection';
import { toast } from 'sonner';
import {
    Loader2,
    Search,
    AlertTriangle,
    Clock,
    Calendar,
    User,
} from 'lucide-react';

// ── Normalized types (serialized Decimal/Date) ──

type AgingRow = {
    salesRepId: string | null;
    salesRepName: string;
    notYetDue: number | string | { toNumber?: () => number };
    current: number | string | { toNumber?: () => number };
    days31to60: number | string | { toNumber?: () => number };
    days61to90: number | string | { toNumber?: () => number };
    over90: number | string | { toNumber?: () => number };
    total: number | string | { toNumber?: () => number };
    invoices?: unknown[];
};

type OverduePromiseRow = {
    id: string;
    promisedDate: string | Date | null;
    promisedAmount: number | string | { toNumber?: () => number } | null;
    type: string;
    userId: string;
    user?: { id: string; name?: string | null } | null;
    invoiceId: string;
    invoice?: {
        id: string;
        invoiceNumber?: string;
        totalAmount?: unknown;
        status?: string;
        dueDate?: string | Date | null;
    } | null;
    outcome?: string | null;
    notes?: string | null;
};

type NoActivityRow = {
    invoiceId: string;
    invoiceNumber: string;
    invoiceDate: string | Date;
    dueDate: string | Date | null;
    daysOverdue: number;
    outstanding: number | string | { toNumber?: () => number };
    status: string;
    salesRepId: string | null;
    customerId: string | null;
    customerName?: string | null;
    bucket: string;
};

type TeamMember = { id: string; name?: string | null };

function num(v: unknown): number {
    return toDecimalNumber(v);
}

function fmtDate(d: string | Date | null | undefined): string {
    if (!d) return '-';
    const dt = d instanceof Date ? d : new Date(d);
    if (isNaN(dt.getTime())) return '-';
    return dt.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}

function fmtDateTime(d: string | Date | null | undefined): string {
    if (!d) return '-';
    const dt = d instanceof Date ? d : new Date(d);
    if (isNaN(dt.getTime())) return '-';
    return dt.toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function bucketBadge(bucket: string) {
    const map: Record<string, { label: string; className: string }> = {
        notYetDue: {
            label: 'Belum JT',
            className: 'bg-slate-100 text-slate-700 border-slate-200',
        },
        '1-30': {
            label: '1-30 hari',
            className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        },
        '31-60': {
            label: '31-60 hari',
            className: 'bg-amber-50 text-amber-700 border-amber-200',
        },
        '61-90': {
            label: '61-90 hari',
            className: 'bg-orange-50 text-orange-700 border-orange-200',
        },
        '90+': {
            label: '90+ hari',
            className: 'bg-red-50 text-red-700 border-red-200',
        },
    };
    const m = map[bucket] ?? {
        label: bucket,
        className: 'bg-gray-100 text-gray-700',
    };
    return (
        <Badge variant="outline" className={`text-[10px] ${m.className}`}>
            {m.label}
        </Badge>
    );
}

export function CollectionDashboardClient({
    initialAging,
    initialOverdue,
    initialNoActivity,
    initialTeam,
}: {
    initialAging: AgingRow[];
    initialOverdue: OverduePromiseRow[];
    initialNoActivity: NoActivityRow[];
    initialTeam: TeamMember[];
}) {
    const [tab, setTab] = useState('aging');
    const [aging, setAging] = useState<AgingRow[]>(initialAging);
    const [overdue] = useState<OverduePromiseRow[]>(initialOverdue);
    const [noActivity, setNoActivity] =
        useState<NoActivityRow[]>(initialNoActivity);
    const [filterSales, setFilterSales] = useState<string>('all');
    const [search, setSearch] = useState('');
    const [asOf, setAsOf] = useState(
        () => new Date().toISOString().split('T')[0],
    );
    const [loading, setLoading] = useState(false);

    const team = initialTeam ?? [];
    const salesOptions = (() => {
        const map = new Map<string, string>();
        for (const r of aging) {
            if (r.salesRepId) map.set(r.salesRepId, r.salesRepName);
        }
        for (const t of team) {
            if (t?.id && !map.has(t.id))
                map.set(t.id, t.name ?? t.id.slice(0, 8));
        }
        return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
    })();

    const filteredAging = (() => {
        let rows = aging;
        if (filterSales !== 'all') {
            rows = rows.filter((r) => r.salesRepId === filterSales);
        }
        if (search) {
            const q = search.toLowerCase();
            rows = rows.filter((r) =>
                (r.salesRepName ?? '').toLowerCase().includes(q),
            );
        }
        return rows;
    })();

    const filteredNoActivity = (() => {
        let rows = noActivity;
        if (filterSales !== 'all') {
            rows = rows.filter((r) => r.salesRepId === filterSales);
        }
        if (search) {
            const q = search.toLowerCase();
            rows = rows.filter(
                (r) =>
                    (r.invoiceNumber ?? '').toLowerCase().includes(q) ||
                    (r.customerName ?? '').toLowerCase().includes(q) ||
                    (r.customerId ?? '').toLowerCase().includes(q),
            );
        }
        return rows;
    })();

    const filteredOverdue = (() => {
        let rows = overdue;
        if (filterSales !== 'all') {
            rows = rows.filter((r) => r.userId === filterSales);
        }
        if (search) {
            const q = search.toLowerCase();
            rows = rows.filter(
                (r) =>
                    (r.invoice?.invoiceNumber ?? '')
                        .toLowerCase()
                        .includes(q) ||
                    (r.user?.name ?? '').toLowerCase().includes(q),
            );
        }
        return rows;
    })();

    const fetchFiltered = useCallback(async () => {
        setLoading(true);
        try {
            const asOfDate = asOf ? new Date(asOf) : undefined;
            const salesIdFilter =
                filterSales !== 'all' ? filterSales : undefined;

            const [agingRes, noActRes] = await Promise.all([
                getSalesArAgingAction({
                    userId: salesIdFilter,
                    asOf: asOfDate,
                } as never),
                getInvoicesWithoutCollectionActivityAction({
                    userId: salesIdFilter,
                    asOf: asOfDate,
                } as never),
            ]);

            if (agingRes?.success && agingRes.data) {
                setAging(agingRes.data as unknown as AgingRow[]);
            } else if (
                agingRes &&
                !(agingRes as { success?: boolean }).success
            ) {
                toast.error(
                    (agingRes as { error?: string }).error ??
                        'Gagal memuat aging',
                );
            }

            if (noActRes?.success && noActRes.data) {
                setNoActivity(noActRes.data as unknown as NoActivityRow[]);
            } else if (
                noActRes &&
                !(noActRes as { success?: boolean }).success
            ) {
                toast.error(
                    (noActRes as { error?: string }).error ??
                        'Gagal memuat tanpa aktivitas',
                );
            }
        } catch {
            toast.error('Gagal memuat data penagihan');
        } finally {
            setLoading(false);
        }
    }, [asOf, filterSales]);

    const totalOutstanding = filteredAging.reduce(
        (s, r) => s + num(r.total),
        0,
    );
    const totalOver90 = filteredAging.reduce((s, r) => s + num(r.over90), 0);

    return (
        <div className="space-y-4">
            <Card>
                <CardContent className="p-4 space-y-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-muted-foreground uppercase">
                                As Of
                            </label>
                            <Input
                                type="date"
                                value={asOf}
                                onChange={(e) => setAsOf(e.target.value)}
                                className="h-9"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-muted-foreground uppercase">
                                Sales
                            </label>
                            <Select
                                value={filterSales}
                                onValueChange={setFilterSales}
                            >
                                <SelectTrigger className="h-9">
                                    <SelectValue placeholder="Semua sales" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">
                                        Semua sales
                                    </SelectItem>
                                    {salesOptions.map((s) => (
                                        <SelectItem key={s.id} value={s.id}>
                                            {s.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1 md:col-span-2">
                            <label className="text-[11px] font-semibold text-muted-foreground uppercase">
                                Cari
                            </label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Sales / invoice / customer..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="pl-9 h-9"
                                />
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            size="sm"
                            className="h-9"
                            onClick={() => void fetchFiltered()}
                            disabled={loading}
                        >
                            {loading ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-1" />
                            ) : null}{' '}
                            Terapkan Filter
                        </Button>
                        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
                            <span>
                                Total Outstanding:{' '}
                                <span className="font-semibold text-foreground">
                                    {formatRupiah(totalOutstanding)}
                                </span>
                            </span>
                            <span
                                title="90+ hari"
                                className="inline-flex items-center gap-1"
                            >
                                <AlertTriangle className="h-3 w-3 text-red-500" />{' '}
                                90+:{' '}
                                <span className="font-semibold text-foreground">
                                    {formatRupiah(totalOver90)}
                                </span>
                            </span>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="flex flex-wrap h-auto gap-1">
                    <TabsTrigger value="aging" className="text-xs">
                        Aging per Sales ({filteredAging.length})
                    </TabsTrigger>
                    <TabsTrigger value="no-activity" className="text-xs">
                        Belum Ditagih ({filteredNoActivity.length})
                    </TabsTrigger>
                    <TabsTrigger value="overdue-promise" className="text-xs">
                        Janji Bayar Lewat ({filteredOverdue.length})
                    </TabsTrigger>
                    <TabsTrigger
                        value="remittance"
                        disabled
                        className="text-xs opacity-60"
                    >
                        Setoran (segera)
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="aging" className="mt-4 space-y-3">
                    <Card>
                        <CardHeader className="p-4 pb-2">
                            <CardTitle className="text-sm">
                                Matriks Aging AR per Sales
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            {filteredAging.length === 0 ? (
                                <div className="p-8 text-center text-sm text-muted-foreground">
                                    Tidak ada piutang pada filter ini
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                        <thead className="bg-muted/50 border-y text-[11px] text-muted-foreground uppercase">
                                            <tr>
                                                <th className="text-left px-3 py-2 font-semibold">
                                                    Sales
                                                </th>
                                                <th className="text-right px-3 py-2 font-semibold">
                                                    Belum JT
                                                </th>
                                                <th className="text-right px-3 py-2 font-semibold">
                                                    1-30
                                                </th>
                                                <th className="text-right px-3 py-2 font-semibold">
                                                    31-60
                                                </th>
                                                <th className="text-right px-3 py-2 font-semibold">
                                                    61-90
                                                </th>
                                                <th className="text-right px-3 py-2 font-semibold">
                                                    90+
                                                </th>
                                                <th className="text-right px-3 py-2 font-semibold">
                                                    Total
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {filteredAging.map((row) => (
                                                <tr
                                                    key={
                                                        row.salesRepId ??
                                                        '__unatt'
                                                    }
                                                    className="hover:bg-muted/30"
                                                >
                                                    <td className="px-3 py-2.5 font-medium max-w-[180px] truncate">
                                                        {row.salesRepName ??
                                                            row.salesRepId ??
                                                            'Unattributed'}
                                                    </td>
                                                    <td className="px-3 py-2.5 text-right tabular-nums">
                                                        {num(row.notYetDue)
                                                            ? formatRupiah(
                                                                  num(
                                                                      row.notYetDue,
                                                                  ),
                                                              )
                                                            : '-'}
                                                    </td>
                                                    <td className="px-3 py-2.5 text-right tabular-nums">
                                                        {num(row.current)
                                                            ? formatRupiah(
                                                                  num(
                                                                      row.current,
                                                                  ),
                                                              )
                                                            : '-'}
                                                    </td>
                                                    <td className="px-3 py-2.5 text-right tabular-nums">
                                                        {num(row.days31to60)
                                                            ? formatRupiah(
                                                                  num(
                                                                      row.days31to60,
                                                                  ),
                                                              )
                                                            : '-'}
                                                    </td>
                                                    <td className="px-3 py-2.5 text-right tabular-nums">
                                                        {num(row.days61to90)
                                                            ? formatRupiah(
                                                                  num(
                                                                      row.days61to90,
                                                                  ),
                                                              )
                                                            : '-'}
                                                    </td>
                                                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-red-600 dark:text-red-400">
                                                        {num(row.over90)
                                                            ? formatRupiah(
                                                                  num(
                                                                      row.over90,
                                                                  ),
                                                              )
                                                            : '-'}
                                                    </td>
                                                    <td className="px-3 py-2.5 text-right tabular-nums font-bold">
                                                        {formatRupiah(
                                                            num(row.total),
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="bg-muted/30 border-t font-semibold">
                                            <tr>
                                                <td className="px-3 py-2">
                                                    Total
                                                </td>
                                                <td className="px-3 py-2 text-right tabular-nums">
                                                    {formatRupiah(
                                                        filteredAging.reduce(
                                                            (s, r) =>
                                                                s +
                                                                num(
                                                                    r.notYetDue,
                                                                ),
                                                            0,
                                                        ),
                                                    )}
                                                </td>
                                                <td className="px-3 py-2 text-right tabular-nums">
                                                    {formatRupiah(
                                                        filteredAging.reduce(
                                                            (s, r) =>
                                                                s +
                                                                num(r.current),
                                                            0,
                                                        ),
                                                    )}
                                                </td>
                                                <td className="px-3 py-2 text-right tabular-nums">
                                                    {formatRupiah(
                                                        filteredAging.reduce(
                                                            (s, r) =>
                                                                s +
                                                                num(
                                                                    r.days31to60,
                                                                ),
                                                            0,
                                                        ),
                                                    )}
                                                </td>
                                                <td className="px-3 py-2 text-right tabular-nums">
                                                    {formatRupiah(
                                                        filteredAging.reduce(
                                                            (s, r) =>
                                                                s +
                                                                num(
                                                                    r.days61to90,
                                                                ),
                                                            0,
                                                        ),
                                                    )}
                                                </td>
                                                <td className="px-3 py-2 text-right tabular-nums text-red-600 dark:text-red-400">
                                                    {formatRupiah(
                                                        filteredAging.reduce(
                                                            (s, r) =>
                                                                s +
                                                                num(r.over90),
                                                            0,
                                                        ),
                                                    )}
                                                </td>
                                                <td className="px-3 py-2 text-right tabular-nums">
                                                    {formatRupiah(
                                                        filteredAging.reduce(
                                                            (s, r) =>
                                                                s +
                                                                num(r.total),
                                                            0,
                                                        ),
                                                    )}
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="no-activity" className="mt-4 space-y-3">
                    <Card className="border-amber-200 dark:border-amber-900/50">
                        <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
                            <CardTitle className="text-sm flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-amber-600" />
                                Piutang Tanpa Aktivitas Penagihan — Paling Perlu
                                Ditindak
                            </CardTitle>
                            <Badge
                                variant="outline"
                                className="text-[10px] bg-amber-50 text-amber-700 border-amber-200"
                            >
                                {filteredNoActivity.length} invoice
                            </Badge>
                        </CardHeader>
                        <CardContent className="p-0">
                            {filteredNoActivity.length === 0 ? (
                                <div className="p-8 text-center text-sm text-muted-foreground">
                                    Semua piutang sudah pernah ditindaklanjuti —
                                    bagus!
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                        <thead className="bg-amber-50/50 dark:bg-amber-950/20 border-y text-[11px] text-muted-foreground uppercase">
                                            <tr>
                                                <th className="text-left px-3 py-2 font-semibold">
                                                    Invoice
                                                </th>
                                                <th className="text-left px-3 py-2 font-semibold">
                                                    Customer
                                                </th>
                                                <th className="text-left px-3 py-2 font-semibold">
                                                    Jatuh Tempo
                                                </th>
                                                <th className="text-left px-3 py-2 font-semibold">
                                                    Umur
                                                </th>
                                                <th className="text-left px-3 py-2 font-semibold">
                                                    Bucket
                                                </th>
                                                <th className="text-right px-3 py-2 font-semibold">
                                                    Outstanding
                                                </th>
                                                <th className="text-left px-3 py-2 font-semibold">
                                                    Sales
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {filteredNoActivity.map((row) => (
                                                <tr
                                                    key={row.invoiceId}
                                                    className="hover:bg-amber-50/30 dark:hover:bg-amber-950/10"
                                                >
                                                    <td className="px-3 py-2.5 font-medium font-mono text-[11px]">
                                                        {row.invoiceNumber}
                                                    </td>
                                                    <td className="px-3 py-2.5 max-w-[160px] truncate">
                                                        {row.customerName ??
                                                            row.customerId ??
                                                            '-'}
                                                    </td>
                                                    <td className="px-3 py-2.5 whitespace-nowrap">
                                                        {fmtDate(row.dueDate)}
                                                    </td>
                                                    <td className="px-3 py-2.5 whitespace-nowrap">
                                                        <span className="inline-flex items-center gap-1">
                                                            <Clock className="h-3 w-3 text-muted-foreground" />
                                                            {row.daysOverdue}{' '}
                                                            hari
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2.5">
                                                        {bucketBadge(
                                                            row.bucket,
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold">
                                                        {formatRupiah(
                                                            num(
                                                                row.outstanding,
                                                            ),
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2.5 max-w-[120px] truncate">
                                                        {row.salesRepId ?? '-'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="overdue-promise" className="mt-4 space-y-3">
                    <Card>
                        <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
                            <CardTitle className="text-sm flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-orange-600" />{' '}
                                Janji Bayar Jatuh Tempo / Lewat
                            </CardTitle>
                            <Badge variant="outline" className="text-[10px]">
                                {filteredOverdue.length} janji
                            </Badge>
                        </CardHeader>
                        <CardContent className="p-0">
                            {filteredOverdue.length === 0 ? (
                                <div className="p-8 text-center text-sm text-muted-foreground">
                                    Tidak ada janji bayar yang lewat
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                        <thead className="bg-muted/50 border-y text-[11px] text-muted-foreground uppercase">
                                            <tr>
                                                <th className="text-left px-3 py-2 font-semibold">
                                                    Janji
                                                </th>
                                                <th className="text-left px-3 py-2 font-semibold">
                                                    Sales
                                                </th>
                                                <th className="text-left px-3 py-2 font-semibold">
                                                    Invoice
                                                </th>
                                                <th className="text-right px-3 py-2 font-semibold">
                                                    Nominal Janji
                                                </th>
                                                <th className="text-left px-3 py-2 font-semibold">
                                                    Catatan
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {filteredOverdue.map((row) => (
                                                <tr
                                                    key={row.id}
                                                    className="hover:bg-muted/30"
                                                >
                                                    <td className="px-3 py-2.5 whitespace-nowrap">
                                                        {fmtDateTime(
                                                            row.promisedDate,
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2.5 truncate max-w-[120px]">
                                                        <span className="inline-flex items-center gap-1">
                                                            <User className="h-3 w-3 text-muted-foreground" />
                                                            {row.user?.name ??
                                                                row.userId.slice(
                                                                    0,
                                                                    8,
                                                                )}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2.5 font-mono text-[11px]">
                                                        {row.invoice
                                                            ?.invoiceNumber ??
                                                            row.invoiceId.slice(
                                                                0,
                                                                8,
                                                            )}
                                                    </td>
                                                    <td className="px-3 py-2.5 text-right tabular-nums">
                                                        {row.promisedAmount !=
                                                        null
                                                            ? formatRupiah(
                                                                  num(
                                                                      row.promisedAmount,
                                                                  ),
                                                              )
                                                            : '-'}
                                                    </td>
                                                    <td className="px-3 py-2.5 max-w-[200px] truncate">
                                                        {row.notes ??
                                                            row.outcome ??
                                                            '-'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="remittance" className="mt-4">
                    <Card>
                        <CardContent className="p-8 text-center text-sm text-muted-foreground">
                            Antrian setoran menunggu verifikasi akan tampil di
                            sini (Step 4 — remittance).
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
