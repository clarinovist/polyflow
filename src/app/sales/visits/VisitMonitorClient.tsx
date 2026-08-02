'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Search,
    CheckCircle,
    XCircle,
    Clock,
    Camera,
    AlertTriangle,
    Loader2,
} from 'lucide-react';
import {
    listTeamVisits,
    getTeamComplianceSummary,
    reviewVisitAction,
} from '@/actions/sales/visit-supervision';
import { toast } from 'sonner';

const REVIEW_BADGE: Record<string, { label: string; className: string }> = {
    PENDING: {
        label: 'Pending',
        className:
            'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300',
    },
    APPROVED: {
        label: 'Approved',
        className:
            'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300',
    },
    REJECTED: {
        label: 'Rejected',
        className:
            'bg-red-100 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300',
    },
    NOT_REQUIRED: {
        label: 'Tidak perlu review',
        className:
            'bg-gray-100 text-gray-600 border-gray-200 dark:bg-zinc-800 dark:text-zinc-400',
    },
};

const EC_REASON_LABELS: Record<string, string> = {
    TOKO_BARU: 'Toko Baru',
    DEKAT_RUTE: 'Dekat Rute',
    PERMINTAAN_DADAKAN: 'Permintaan Dadakan',
    TOKO_TUTUP_GANTI: 'Toko Tutup Ganti',
};

type Visit = {
    id: string;
    customerId: string;
    customer?: { id: string; name: string; code?: string | null } | null;
    userId: string;
    user?: { id: string; name: string | null } | null;
    checkInTime: string | Date;
    checkOutTime?: string | Date | null;
    durationSeconds: number;
    distance: number;
    latitude?: number | string | null;
    longitude?: number | string | null;
    notes?: string | null;
    photoUrl?: string | null;
    isExtraCall: boolean;
    extraReason?: string | null;
    reviewStatus: string;
    routePlanItemId?: string | null;
};

type VisitsData = {
    visits: Visit[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
};

type ComplianceRow = {
    userId: string;
    userName: string;
    assigned: number;
    visited: number;
    extraCalls: number;
    compliance: number;
};

type CustomerOpt = { id: string; name: string; code?: string | null };

export function VisitMonitorClient({
    initialVisits,
    initialCompliance,
    initialFrom,
    initialTo,
}: {
    initialVisits: VisitsData;
    initialCompliance: ComplianceRow[];
    initialFrom: string;
    initialTo: string;
    customers: CustomerOpt[];
}) {
    const [data, setData] = useState<VisitsData>(initialVisits);
    const [compliance, setCompliance] =
        useState<ComplianceRow[]>(initialCompliance);
    const [from, setFrom] = useState(initialFrom);
    const [to, setTo] = useState(initialTo);
    const [search, setSearch] = useState('');
    const [filterSales, setFilterSales] = useState<string>('all');
    const [extraOnly, setExtraOnly] = useState(false);
    const [reviewFilter, setReviewFilter] = useState<string>('all');
    const [loading, setLoading] = useState(false);
    const [reviewingId, setReviewingId] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const fromDate = new Date(from);
            const toDate = new Date(to + 'T23:59:59.999Z');

            const filters: Record<string, unknown> = {
                from: fromDate,
                to: toDate,
                page: 1,
                pageSize: 100,
            };
            if (filterSales !== 'all') filters.userId = filterSales;
            if (extraOnly) filters.isExtraCall = true;
            if (reviewFilter !== 'all') filters.reviewStatus = reviewFilter;

            const [visitsRes, compRes] = await Promise.all([
                listTeamVisits(filters as Parameters<typeof listTeamVisits>[0]),
                getTeamComplianceSummary(
                    from,
                    to + 'T23:59:59.999Z',
                    filterSales !== 'all' ? filterSales : undefined,
                ),
            ]);

            if (visitsRes?.success && visitsRes.data) {
                setData(visitsRes.data as VisitsData);
            }
            if (compRes?.success && compRes.data) {
                setCompliance(compRes.data as ComplianceRow[]);
            }
        } catch {
            toast.error('Gagal memuat data kunjungan');
        } finally {
            setLoading(false);
        }
    }, [from, to, filterSales, extraOnly, reviewFilter]);

    const handleReview = async (
        visitId: string,
        decision: 'APPROVED' | 'REJECTED',
    ) => {
        if (
            !confirm(
                decision === 'APPROVED'
                    ? 'Approve extra call ini?'
                    : 'Reject extra call ini? Tidak akan dihitung compliance.',
            )
        ) {
            return;
        }
        setReviewingId(visitId);
        try {
            const res = await reviewVisitAction(visitId, decision);
            if (res?.success) {
                toast.success(
                    decision === 'APPROVED'
                        ? 'Extra call disetujui'
                        : 'Extra call ditolak',
                );
                await fetchData();
            } else {
                const err =
                    (res as { error?: string })?.error || 'Gagal review';
                toast.error(err);
            }
        } catch {
            toast.error('Gagal review kunjungan');
        } finally {
            setReviewingId(null);
        }
    };

    const filteredVisits = data.visits.filter((v) => {
        if (!search) return true;
        const q = search.toLowerCase();
        const custName = (v.customer?.name ?? '').toLowerCase();
        const userName = (v.user?.name ?? '').toLowerCase();
        return custName.includes(q) || userName.includes(q);
    });

    const salesOptions = Array.from(
        new Map(
            compliance.map((r) => [
                r.userId,
                { id: r.userId, name: r.userName },
            ]),
        ).values(),
    );

    return (
        <div className="space-y-6">
            {/* Compliance summary */}
            {compliance.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {compliance.map((row) => (
                        <Card key={row.userId} className="overflow-hidden">
                            <CardHeader className="p-3 pb-1">
                                <CardTitle className="text-sm truncate">
                                    {row.userName}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-3 pt-1">
                                <div className="grid grid-cols-3 gap-2 text-[11px]">
                                    <div>
                                        <p className="text-muted-foreground">
                                            Assigned
                                        </p>
                                        <p className="font-semibold text-sm">
                                            {row.assigned}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-muted-foreground">
                                            Visited
                                        </p>
                                        <p className="font-semibold text-sm">
                                            {row.visited}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-muted-foreground">
                                            EC
                                        </p>
                                        <p className="font-semibold text-sm">
                                            {row.extraCalls}
                                        </p>
                                    </div>
                                </div>
                                <div className="mt-2 flex items-center gap-2">
                                    <div className="h-1.5 flex-1 bg-muted rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-primary rounded-full"
                                            style={{
                                                width: `${Math.min(100, Math.max(0, row.compliance))}%`,
                                            }}
                                        />
                                    </div>
                                    <span className="text-xs font-semibold">
                                        {row.compliance}%
                                    </span>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Filters */}
            <Card>
                <CardContent className="p-4 space-y-3">
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-muted-foreground uppercase">
                                Dari
                            </label>
                            <Input
                                type="date"
                                value={from}
                                onChange={(e) => setFrom(e.target.value)}
                                className="h-9"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-muted-foreground uppercase">
                                Sampai
                            </label>
                            <Input
                                type="date"
                                value={to}
                                onChange={(e) => setTo(e.target.value)}
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
                        <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-muted-foreground uppercase">
                                Status Review
                            </label>
                            <Select
                                value={reviewFilter}
                                onValueChange={setReviewFilter}
                            >
                                <SelectTrigger className="h-9">
                                    <SelectValue placeholder="Semua status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Semua</SelectItem>
                                    <SelectItem value="PENDING">
                                        Pending
                                    </SelectItem>
                                    <SelectItem value="APPROVED">
                                        Approved
                                    </SelectItem>
                                    <SelectItem value="REJECTED">
                                        Rejected
                                    </SelectItem>
                                    <SelectItem value="NOT_REQUIRED">
                                        Tidak perlu review
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1 flex flex-col justify-end">
                            <div className="flex items-center gap-2 h-9">
                                <label className="flex items-center gap-2 text-xs cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={extraOnly}
                                        onChange={(e) =>
                                            setExtraOnly(e.target.checked)
                                        }
                                        className="rounded border-input"
                                    />
                                    Hanya Extra Call
                                </label>
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Cari customer atau sales..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-9 h-9"
                            />
                        </div>
                        <Button
                            onClick={fetchData}
                            disabled={loading}
                            size="sm"
                            className="h-9"
                        >
                            {loading ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-1" />
                            ) : null}
                            Terapkan Filter
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Visit table */}
            <Card>
                <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-sm">
                        Kunjungan ({filteredVisits.length} / {data.total})
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {filteredVisits.length === 0 ? (
                        <div className="p-8 text-center text-sm text-muted-foreground">
                            Tidak ada kunjungan pada rentang ini
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead className="bg-muted/50 border-y text-[11px] text-muted-foreground uppercase">
                                    <tr>
                                        <th className="text-left px-3 py-2 font-semibold">
                                            Waktu
                                        </th>
                                        <th className="text-left px-3 py-2 font-semibold">
                                            Sales
                                        </th>
                                        <th className="text-left px-3 py-2 font-semibold">
                                            Customer
                                        </th>
                                        <th className="text-left px-3 py-2 font-semibold">
                                            Durasi
                                        </th>
                                        <th className="text-left px-3 py-2 font-semibold">
                                            Jarak
                                        </th>
                                        <th className="text-left px-3 py-2 font-semibold">
                                            Extra Call
                                        </th>
                                        <th className="text-left px-3 py-2 font-semibold">
                                            Review
                                        </th>
                                        <th className="text-left px-3 py-2 font-semibold">
                                            Foto
                                        </th>
                                        <th className="text-right px-3 py-2 font-semibold">
                                            Aksi
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {filteredVisits.map((v) => {
                                        const reviewMeta =
                                            REVIEW_BADGE[v.reviewStatus] ??
                                            REVIEW_BADGE.NOT_REQUIRED;
                                        const isPending =
                                            v.reviewStatus === 'PENDING';
                                        const isBusy = reviewingId === v.id;
                                        return (
                                            <tr
                                                key={v.id}
                                                className="hover:bg-muted/30"
                                            >
                                                <td className="px-3 py-2.5 whitespace-nowrap">
                                                    <span className="flex items-center gap-1">
                                                        <Clock className="h-3 w-3 text-muted-foreground" />
                                                        {new Date(
                                                            v.checkInTime,
                                                        ).toLocaleString(
                                                            'id-ID',
                                                            {
                                                                day: '2-digit',
                                                                month: 'short',
                                                                hour: '2-digit',
                                                                minute: '2-digit',
                                                            },
                                                        )}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2.5 truncate max-w-[120px]">
                                                    {v.user?.name ??
                                                        v.userId.slice(0, 8)}
                                                </td>
                                                <td className="px-3 py-2.5 truncate max-w-[150px]">
                                                    {v.customer?.name ??
                                                        v.customerId.slice(
                                                            0,
                                                            8,
                                                        )}
                                                </td>
                                                <td className="px-3 py-2.5 whitespace-nowrap">
                                                    {Math.floor(
                                                        v.durationSeconds / 60,
                                                    )}
                                                    m {v.durationSeconds % 60}d
                                                </td>
                                                <td className="px-3 py-2.5 whitespace-nowrap">
                                                    {Math.round(v.distance)}m
                                                </td>
                                                <td className="px-3 py-2.5">
                                                    {v.isExtraCall ? (
                                                        <span className="inline-flex items-center gap-1">
                                                            <Badge
                                                                variant="outline"
                                                                className="bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-300 text-[10px]"
                                                            >
                                                                <AlertTriangle className="h-2.5 w-2.5" />{' '}
                                                                EC
                                                            </Badge>
                                                            {v.extraReason && (
                                                                <span className="text-[10px] text-muted-foreground">
                                                                    {EC_REASON_LABELS[
                                                                        v
                                                                            .extraReason
                                                                    ] ??
                                                                        v.extraReason}
                                                                </span>
                                                            )}
                                                        </span>
                                                    ) : (
                                                        <span className="text-muted-foreground">
                                                            -
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2.5">
                                                    <Badge
                                                        variant="outline"
                                                        className={`text-[10px] ${reviewMeta.className}`}
                                                    >
                                                        {reviewMeta.label}
                                                    </Badge>
                                                </td>
                                                <td className="px-3 py-2.5">
                                                    {v.photoUrl ? (
                                                        <a
                                                            href={v.photoUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center gap-1 text-primary hover:underline"
                                                        >
                                                            <Camera className="h-3 w-3" />{' '}
                                                            Lihat
                                                        </a>
                                                    ) : (
                                                        <span className="text-muted-foreground">
                                                            -
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2.5 text-right">
                                                    {isPending ? (
                                                        <div className="flex items-center justify-end gap-1">
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                className="h-7 text-[11px] px-2"
                                                                disabled={
                                                                    isBusy
                                                                }
                                                                onClick={() =>
                                                                    handleReview(
                                                                        v.id,
                                                                        'APPROVED',
                                                                    )
                                                                }
                                                            >
                                                                {isBusy ? (
                                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                                ) : (
                                                                    <CheckCircle className="h-3 w-3 mr-0.5" />
                                                                )}{' '}
                                                                Approve
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="destructive"
                                                                className="h-7 text-[11px] px-2"
                                                                disabled={
                                                                    isBusy
                                                                }
                                                                onClick={() =>
                                                                    handleReview(
                                                                        v.id,
                                                                        'REJECTED',
                                                                    )
                                                                }
                                                            >
                                                                {isBusy ? (
                                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                                ) : (
                                                                    <XCircle className="h-3 w-3 mr-0.5" />
                                                                )}{' '}
                                                                Reject
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        <span className="text-muted-foreground">
                                                            -
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
