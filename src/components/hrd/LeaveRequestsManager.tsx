'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    createLeaveRequest,
    listLeaveRequests,
    approveLeaveRequest,
    rejectLeaveRequest,
} from '@/actions/hrd/disciplinary-leave';
import { getEmployees } from '@/actions/admin/employees';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';

type LeaveType = 'ANNUAL' | 'SICK' | 'PERMISSION' | 'MATERNITY' | 'UNPAID' | 'OTHER';
type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

const TYPE_LABEL: Record<LeaveType, string> = {
    ANNUAL: 'Cuti Tahunan', SICK: 'Sakit', PERMISSION: 'Izin', MATERNITY: 'Melahirkan', UNPAID: 'Tidak Dibayar', OTHER: 'Lainnya',
};
const STATUS_BADGE: Record<LeaveStatus, string> = {
    PENDING: 'bg-amber-500/10 text-amber-700',
    APPROVED: 'bg-green-500/10 text-green-700',
    REJECTED: 'bg-red-500/10 text-red-700',
};

export function LeaveRequestsManager() {
    const [employees, setEmployees] = useState<{ id: string; name: string; code: string }[]>([]);
    const [requests, setRequests] = useState<Array<{
        id: string; employee?: { code: string; name: string }; type: string;
        startDate: string | Date; endDate: string | Date; reason: string | null;
        status: 'PENDING' | 'APPROVED' | 'REJECTED'; reviewNotes: string | null;
    }>>([]);
    const [loading, setLoading] = useState(false);
    const [filterStatus, setFilterStatus] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'>('ALL');

    const [form, setForm] = useState({
        employeeId: '',
        type: 'ANNUAL' as LeaveType,
        startDate: '',
        endDate: '',
        reason: '',
    });
    const [docFile, setDocFile] = useState<File | null>(null);

    const loadEmployees = async () => {
        const res = await getEmployees();
        if (res.success && Array.isArray(res.data)) {
            setEmployees(res.data.map((e: { id: string; name: string; code: string }) => ({ id: e.id, name: e.name, code: e.code })));
        }
    };

    const loadRequests = async () => {
        setLoading(true);
        const filters = filterStatus === 'ALL' ? undefined : { status: filterStatus as LeaveStatus };
        const res = await listLeaveRequests(filters);
        setRequests(res.success ? res.data ?? [] : []);
        setLoading(false);
    };

    useEffect(() => {
        loadEmployees();
        loadRequests();
    }, []);

    useEffect(() => {
        loadRequests();
    }, [filterStatus]);

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
                const up = await fetch('/api/upload/hrd-doc', { method: 'POST', body: fd });
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
                setForm({ employeeId: '', type: 'ANNUAL', startDate: '', endDate: '', reason: '' });
                setDocFile(null);
                loadRequests();
            } else {
                toast.error(res.error || 'Gagal membuat pengajuan');
            }
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Gagal');
        }
    };

    const handleApprove = async (id: string) => {
        const notes = window.prompt('Catatan approval (opsional):') ?? undefined;
        const res = await approveLeaveRequest(id, notes);
        if (res.success) {
            toast.success('Cuti disetujui');
            loadRequests();
        } else {
            toast.error(res.error || 'Gagal approval');
        }
    };

    const handleReject = async (id: string) => {
        const notes = window.prompt('Alasan penolakan (opsional):') ?? undefined;
        const res = await rejectLeaveRequest(id, notes);
        if (res.success) {
            toast.success('Cuti ditolak');
            loadRequests();
        } else {
            toast.error(res.error || 'Gagal reject');
        }
    };

    return (
        <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 rounded-lg border bg-card p-4 space-y-3">
                <h2 className="text-sm font-bold uppercase tracking-tight">Pengajuan Baru</h2>
                <form onSubmit={handleSubmit} className="space-y-3">
                    <div className="space-y-1">
                        <Label className="text-xs font-semibold">Karyawan</Label>
                        <Select value={form.employeeId} onValueChange={(v) => setForm({ ...form, employeeId: v })}>
                            <SelectTrigger className="h-9"><SelectValue placeholder="Pilih karyawan" /></SelectTrigger>
                            <SelectContent>
                                {employees.map((e) => (
                                    <SelectItem key={e.id} value={e.id}>{e.code} — {e.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs font-semibold">Jenis</Label>
                        <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as LeaveType })}>
                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {(Object.keys(TYPE_LABEL) as LeaveType[]).map((t) => (
                                    <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">Mulai</Label>
                            <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="h-9" />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">Sampai</Label>
                            <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="h-9" />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs font-semibold">Alasan</Label>
                        <Textarea rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs font-semibold">Dokumen (surat sakit/izin, opsional)</Label>
                        <Input
                            type="file"
                            accept="image/*,application/pdf"
                            className="h-9 text-xs"
                            onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                        />
                    </div>
                    <Button type="submit" size="sm" disabled={!form.employeeId}>Ajukan</Button>
                </form>
            </div>

            <div className="lg:col-span-2 space-y-3">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold uppercase tracking-tight">Daftar Pengajuan</h2>
                    <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as typeof filterStatus)}>
                        <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">Semua</SelectItem>
                            <SelectItem value="PENDING">Pending</SelectItem>
                            <SelectItem value="APPROVED">Disetujui</SelectItem>
                            <SelectItem value="REJECTED">Ditolak</SelectItem>
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
                                <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Memuat…</td></tr>
                            )}
                            {!loading && requests.length === 0 && (
                                <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Belum ada pengajuan</td></tr>
                            )}
                            {requests.map((r) => (
                                <tr key={r.id} className="border-t">
                                    <td className="p-2">{r.employee?.code} — {r.employee?.name}</td>
                                    <td className="p-2">{TYPE_LABEL[r.type as LeaveType]}</td>
                                    <td className="p-2 text-xs">
                                        {format(new Date(r.startDate), 'dd MMM', { locale: id })} – {format(new Date(r.endDate), 'dd MMM yyyy', { locale: id })}
                                    </td>
                                    <td className="p-2 text-xs text-muted-foreground max-w-[200px] truncate" title={r.reason ?? ''}>{r.reason ?? '—'}</td>
                                    <td className="p-2">
                                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[r.status as LeaveStatus]}`}>{r.status}</span>
                                    </td>
                                    <td className="p-2 text-right space-x-1">
                                        {r.status === 'PENDING' && (
                                            <>
                                                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleApprove(r.id)}>Approve</Button>
                                                <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => handleReject(r.id)}>Reject</Button>
                                            </>
                                        )}
                                        {r.reviewNotes && (
                                            <div className="text-[10px] text-muted-foreground mt-1" title={r.reviewNotes}>ⓘ {r.reviewNotes}</div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
