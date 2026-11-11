'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    createLeaveRequest,
    listLeaveRequests,
    approveLeaveRequest,
    rejectLeaveRequest,
    getLeaveRecap,
} from '@/actions/hrd/disciplinary-leave';
import { getEmployees } from '@/actions/admin/employees';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { Download } from 'lucide-react';
import {
    LeaveReviewDialog,
    type LeaveReviewMode,
    type LeaveReviewTarget,
} from './LeaveReviewDialog';

type LeaveType =
    | 'ANNUAL'
    | 'SICK'
    | 'PERMISSION'
    | 'MATERNITY'
    | 'UNPAID'
    | 'OTHER';
type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

const TYPE_LABEL: Record<LeaveType, string> = {
    ANNUAL: 'Cuti Tahunan',
    SICK: 'Sakit',
    PERMISSION: 'Izin',
    MATERNITY: 'Melahirkan',
    UNPAID: 'Tidak Dibayar',
    OTHER: 'Lainnya',
};
const STATUS_LABEL: Record<LeaveStatus, string> = {
    PENDING: 'Menunggu',
    APPROVED: 'Disetujui',
    REJECTED: 'Ditolak',
};
const STATUS_BADGE: Record<LeaveStatus, string> = {
    PENDING: 'bg-amber-500/10 text-amber-700',
    APPROVED: 'bg-green-500/10 text-green-700',
    REJECTED: 'bg-red-500/10 text-red-700',
};

interface LeaveRow {
    id: string;
    employee?: { code: string; name: string };
    type: string;
    startDate: string | Date;
    endDate: string | Date;
    reason: string | null;
    status: LeaveStatus;
    reviewNotes: string | null;
}

interface ReviewState {
    target: LeaveReviewTarget;
    mode: LeaveReviewMode;
}

function statusLabel(status: string): string {
    return STATUS_LABEL[status as LeaveStatus] ?? status;
}

/** The approve action may report how many clocked-in days were left untouched. */
function readPreservedCount(data: unknown): number {
    if (typeof data !== 'object' || data === null) return 0;
    const count = (data as { preservedAttendanceCount?: unknown })
        .preservedAttendanceCount;
    return typeof count === 'number' ? count : 0;
}

interface LeaveRequestsManagerProps {
    initialStatus?: LeaveStatus;
    initialRequestId?: string;
}

export function LeaveRequestsManager({
    initialStatus,
    initialRequestId,
}: LeaveRequestsManagerProps) {
    const [employees, setEmployees] = useState<
        { id: string; name: string; code: string }[]
    >([]);
    const [requests, setRequests] = useState<LeaveRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [review, setReview] = useState<ReviewState | null>(null);
    const [isReviewing, setIsReviewing] = useState(false);
    const [filterStatus, setFilterStatus] = useState<
        'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'
    >(initialStatus ?? 'ALL');
    const now = new Date();
    const [recapYear, setRecapYear] = useState(now.getFullYear());
    const [recapMonth, setRecapMonth] = useState(now.getMonth() + 1);
    const [recap, setRecap] = useState<{
        byTypeStatus: Array<{
            type: string;
            status: string;
            count: number;
            totalDays: number;
        }>;
        totals: {
            pending: number;
            approved: number;
            rejected: number;
            totalDaysApproved: number;
            requestCount: number;
        };
    } | null>(null);

    const [form, setForm] = useState({
        employeeId: '',
        type: 'ANNUAL' as LeaveType,
        startDate: '',
        endDate: '',
        reason: '',
    });
    const [docFile, setDocFile] = useState<File | null>(null);

    const loadEmployees = useCallback(async () => {
        const res = await getEmployees();
        if (res.success && Array.isArray(res.data)) {
            setEmployees(
                res.data.map(
                    (e: { id: string; name: string; code: string }) => ({
                        id: e.id,
                        name: e.name,
                        code: e.code,
                    }),
                ),
            );
        }
    }, []);

    const loadRequests = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        const filters =
            filterStatus === 'ALL'
                ? undefined
                : { status: filterStatus as LeaveStatus };
        try {
            const res = await listLeaveRequests(filters);
            if (res.success) {
                setRequests(res.data ?? []);
            } else {
                setRequests([]);
                setLoadError(res.error || 'Gagal memuat daftar pengajuan');
            }
        } catch (err) {
            setRequests([]);
            setLoadError(
                err instanceof Error
                    ? err.message
                    : 'Gagal memuat daftar pengajuan',
            );
        } finally {
            setLoading(false);
        }
    }, [filterStatus]);

    const loadRecap = useCallback(async () => {
        const res = await getLeaveRecap(recapYear, recapMonth);
        if (res.success && res.data) {
            setRecap({
                byTypeStatus: res.data.byTypeStatus,
                totals: res.data.totals,
            });
        } else {
            setRecap(null);
        }
    }, [recapYear, recapMonth]);

    useEffect(() => {
        loadEmployees();
    }, [loadEmployees]);

    useEffect(() => {
        setFilterStatus(initialStatus ?? 'ALL');
    }, [initialStatus]);

    useEffect(() => {
        loadRequests();
    }, [loadRequests]);

    useEffect(() => {
        if (!initialRequestId || loading) return;

        const target = document.getElementById(
            `leave-request-${initialRequestId}`,
        );
        target?.scrollIntoView({ block: 'center' });
        target?.focus({ preventScroll: true });
    }, [initialRequestId, loading, requests]);

    useEffect(() => {
        loadRecap();
    }, [loadRecap]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.employeeId || !form.startDate || !form.endDate) {
            toast.error('Lengkapi semua field wajib');
            return;
        }
        try {
            let documentUrl: string | undefined;
            if (docFile) {
                const fd = new FormData();
                fd.append('file', docFile);
                fd.append('entityId', form.employeeId);
                fd.append('category', 'leave');
                const up = await fetch('/api/upload/hrd-doc', {
                    method: 'POST',
                    body: fd,
                });
                if (!up.ok) {
                    toast.error('Gagal upload dokumen cuti');
                    return;
                }
                const json = (await up.json()) as { publicUrl?: string };
                documentUrl = json.publicUrl;
            }
            const res = await createLeaveRequest({
                employeeId: form.employeeId,
                type: form.type,
                startDate: new Date(form.startDate),
                endDate: new Date(form.endDate),
                reason: form.reason,
                documentUrl,
            });
            if (res.success) {
                toast.success('Pengajuan cuti dibuat');
                setForm({
                    employeeId: '',
                    type: 'ANNUAL',
                    startDate: '',
                    endDate: '',
                    reason: '',
                });
                setDocFile(null);
                loadRequests();
            } else {
                toast.error(res.error || 'Gagal membuat pengajuan');
            }
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Gagal');
        }
    };

    const openReview = (r: LeaveRow, mode: LeaveReviewMode) => {
        setReview({
            mode,
            target: {
                id: r.id,
                employeeName: r.employee?.name ?? 'Karyawan',
                startDate: r.startDate,
                endDate: r.endDate,
            },
        });
    };

    const handleConfirmReview = async (notes: string) => {
        if (!review || isReviewing) return;
        const { target, mode } = review;
        setIsReviewing(true);
        try {
            const res =
                mode === 'approve'
                    ? await approveLeaveRequest(target.id, notes || undefined)
                    : await rejectLeaveRequest(target.id, notes);
            if (!res.success) {
                toast.error(res.error || 'Gagal memproses pengajuan');
                return;
            }
            toast.success(
                mode === 'approve' ? 'Cuti disetujui' : 'Cuti ditolak',
            );
            const preserved = readPreservedCount(res.data);
            if (preserved > 0) {
                toast.info(
                    `${preserved} hari sudah punya catatan hadir dan tidak diubah`,
                );
            }
            setReview(null);
            loadRequests();
        } catch (err) {
            toast.error(
                err instanceof Error
                    ? err.message
                    : 'Gagal memproses pengajuan',
            );
        } finally {
            setIsReviewing(false);
        }
    };

    return (
        <div className="space-y-4">
            <LeaveReviewDialog
                target={review?.target ?? null}
                mode={review?.mode ?? 'approve'}
                isBusy={isReviewing}
                onConfirm={handleConfirmReview}
                onCancel={() => setReview(null)}
            />
            <div className="rounded-lg border bg-card p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-bold uppercase tracking-tight">
                        Rekap Bulan
                    </h2>
                    <div className="flex items-center gap-2">
                        <Select
                            value={String(recapMonth)}
                            onValueChange={(v) => setRecapMonth(Number(v))}
                        >
                            <SelectTrigger className="h-8 w-32 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {[
                                    'Jan',
                                    'Feb',
                                    'Mar',
                                    'Apr',
                                    'Mei',
                                    'Jun',
                                    'Jul',
                                    'Agu',
                                    'Sep',
                                    'Okt',
                                    'Nov',
                                    'Des',
                                ].map((m, i) => (
                                    <SelectItem key={m} value={String(i + 1)}>
                                        {m}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select
                            value={String(recapYear)}
                            onValueChange={(v) => setRecapYear(Number(v))}
                        >
                            <SelectTrigger className="h-8 w-24 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {[2025, 2026, 2027].map((y) => (
                                    <SelectItem key={y} value={String(y)}>
                                        {y}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <a
                            href={`/api/hrd/leave/export?year=${recapYear}&month=${recapMonth}`}
                        >
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 gap-1 text-xs"
                            >
                                <Download className="h-3.5 w-3.5" /> CSV
                            </Button>
                        </a>
                    </div>
                </div>
                {recap && (
                    <>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            <div className="rounded-lg bg-muted/40 p-2 text-center">
                                <div className="text-[10px] text-muted-foreground">
                                    Menunggu
                                </div>
                                <div className="font-bold">
                                    {recap.totals.pending}
                                </div>
                            </div>
                            <div className="rounded-lg bg-muted/40 p-2 text-center">
                                <div className="text-[10px] text-muted-foreground">
                                    Disetujui
                                </div>
                                <div className="font-bold text-green-700">
                                    {recap.totals.approved}
                                </div>
                            </div>
                            <div className="rounded-lg bg-muted/40 p-2 text-center">
                                <div className="text-[10px] text-muted-foreground">
                                    Ditolak
                                </div>
                                <div className="font-bold text-red-700">
                                    {recap.totals.rejected}
                                </div>
                            </div>
                            <div className="rounded-lg bg-muted/40 p-2 text-center">
                                <div className="text-[10px] text-muted-foreground">
                                    Hari disetujui
                                </div>
                                <div className="font-bold">
                                    {recap.totals.totalDaysApproved}
                                </div>
                            </div>
                        </div>
                        {recap.byTypeStatus.length > 0 && (
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead className="text-left text-muted-foreground">
                                        <tr>
                                            <th className="p-1">Jenis</th>
                                            <th className="p-1">Status</th>
                                            <th className="p-1 text-right">
                                                Count
                                            </th>
                                            <th className="p-1 text-right">
                                                Hari
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {recap.byTypeStatus.map((r) => (
                                            <tr
                                                key={`${r.type}-${r.status}`}
                                                className="border-t"
                                            >
                                                <td className="p-1">
                                                    {TYPE_LABEL[
                                                        r.type as LeaveType
                                                    ] ?? r.type}
                                                </td>
                                                <td className="p-1">
                                                    {statusLabel(r.status)}
                                                </td>
                                                <td className="p-1 text-right">
                                                    {r.count}
                                                </td>
                                                <td className="p-1 text-right">
                                                    {r.totalDays}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                )}
            </div>
            <div className="grid lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1 rounded-lg border bg-card p-4 space-y-3">
                    <h2 className="text-sm font-bold uppercase tracking-tight">
                        Pengajuan Baru
                    </h2>
                    <form onSubmit={handleSubmit} className="space-y-3">
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">
                                Karyawan
                            </Label>
                            <Select
                                value={form.employeeId}
                                onValueChange={(v) =>
                                    setForm({ ...form, employeeId: v })
                                }
                            >
                                <SelectTrigger className="h-9">
                                    <SelectValue placeholder="Pilih karyawan" />
                                </SelectTrigger>
                                <SelectContent>
                                    {employees.map((e) => (
                                        <SelectItem key={e.id} value={e.id}>
                                            {e.code} — {e.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">
                                Jenis
                            </Label>
                            <Select
                                value={form.type}
                                onValueChange={(v) =>
                                    setForm({ ...form, type: v as LeaveType })
                                }
                            >
                                <SelectTrigger className="h-9">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {(
                                        Object.keys(TYPE_LABEL) as LeaveType[]
                                    ).map((t) => (
                                        <SelectItem key={t} value={t}>
                                            {TYPE_LABEL[t]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                                <Label className="text-xs font-semibold">
                                    Mulai
                                </Label>
                                <Input
                                    type="date"
                                    value={form.startDate}
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            startDate: e.target.value,
                                        })
                                    }
                                    className="h-9"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs font-semibold">
                                    Sampai
                                </Label>
                                <Input
                                    type="date"
                                    value={form.endDate}
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            endDate: e.target.value,
                                        })
                                    }
                                    className="h-9"
                                />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">
                                Alasan
                            </Label>
                            <Textarea
                                rows={2}
                                value={form.reason}
                                onChange={(e) =>
                                    setForm({ ...form, reason: e.target.value })
                                }
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">
                                Dokumen (surat sakit/izin, opsional)
                            </Label>
                            <Input
                                type="file"
                                accept="image/*,application/pdf"
                                className="h-9 text-xs"
                                onChange={(e) =>
                                    setDocFile(e.target.files?.[0] ?? null)
                                }
                            />
                        </div>
                        <Button
                            type="submit"
                            size="sm"
                            disabled={!form.employeeId}
                        >
                            Ajukan
                        </Button>
                    </form>
                </div>

                <div className="lg:col-span-2 space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-bold uppercase tracking-tight">
                            Daftar Pengajuan
                        </h2>
                        <Select
                            value={filterStatus}
                            onValueChange={(v) =>
                                setFilterStatus(v as typeof filterStatus)
                            }
                        >
                            <SelectTrigger className="h-8 w-32 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">Semua</SelectItem>
                                <SelectItem value="PENDING">Menunggu</SelectItem>
                                <SelectItem value="APPROVED">
                                    Disetujui
                                </SelectItem>
                                <SelectItem value="REJECTED">
                                    Ditolak
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="rounded-lg border overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/40 text-left">
                                <tr>
                                    <th className="p-2">Karyawan</th>
                                    <th className="p-2">Jenis</th>
                                    <th className="p-2">Rentang</th>
                                    <th className="p-2">Alasan</th>
                                    <th className="p-2">Status</th>
                                    <th className="p-2"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading && (
                                    <tr>
                                        <td
                                            colSpan={6}
                                            className="p-4 text-center text-muted-foreground"
                                        >
                                            Memuat…
                                        </td>
                                    </tr>
                                )}
                                {!loading && loadError && (
                                    <tr>
                                        <td
                                            colSpan={6}
                                            className="p-4 text-center text-destructive"
                                        >
                                            <div>Gagal memuat pengajuan: {loadError}</div>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                className="mt-2 h-7 text-xs"
                                                onClick={() => loadRequests()}
                                            >
                                                Coba lagi
                                            </Button>
                                        </td>
                                    </tr>
                                )}
                                {!loading && !loadError && requests.length === 0 && (
                                    <tr>
                                        <td
                                            colSpan={6}
                                            className="p-4 text-center text-muted-foreground"
                                        >
                                            Belum ada pengajuan
                                        </td>
                                    </tr>
                                )}
                                {requests.map((r) => (
                                    <tr
                                        key={r.id}
                                        id={`leave-request-${r.id}`}
                                        tabIndex={-1}
                                        className={`border-t focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary ${
                                            initialRequestId === r.id
                                                ? 'bg-primary/5'
                                                : ''
                                        }`}
                                    >
                                        <td className="p-2">
                                            {r.employee?.code} —{' '}
                                            {r.employee?.name}
                                        </td>
                                        <td className="p-2">
                                            {TYPE_LABEL[r.type as LeaveType]}
                                        </td>
                                        <td className="p-2 text-xs">
                                            {format(
                                                new Date(r.startDate),
                                                'dd MMM',
                                                { locale: id },
                                            )}{' '}
                                            –{' '}
                                            {format(
                                                new Date(r.endDate),
                                                'dd MMM yyyy',
                                                { locale: id },
                                            )}
                                        </td>
                                        <td
                                            className="p-2 text-xs text-muted-foreground max-w-[200px] truncate"
                                            title={r.reason ?? ''}
                                        >
                                            {r.reason ?? '—'}
                                        </td>
                                        <td className="p-2">
                                            <span
                                                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[r.status as LeaveStatus]}`}
                                            >
                                                {statusLabel(r.status)}
                                            </span>
                                        </td>
                                        <td className="p-2 text-right space-x-1">
                                            {r.status === 'PENDING' && (
                                                <>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-7 text-xs"
                                                        onClick={() =>
                                                            openReview(r, 'approve')
                                                        }
                                                    >
                                                        Setujui
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-7 text-xs text-destructive"
                                                        onClick={() =>
                                                            openReview(r, 'reject')
                                                        }
                                                    >
                                                        Tolak
                                                    </Button>
                                                </>
                                            )}
                                            {r.reviewNotes && (
                                                <div
                                                    className="text-[10px] text-muted-foreground mt-1"
                                                    title={r.reviewNotes}
                                                >
                                                    ⓘ {r.reviewNotes}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
