'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    listDisciplinaryActions,
    createDisciplinaryAction,
    getDisciplinaryRecap,
} from '@/actions/hrd/disciplinary-leave';
import { getEmployees } from '@/actions/admin/employees';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { Download } from 'lucide-react';

type DType = 'VERBAL_WARNING' | 'SP1' | 'SP2' | 'SP3' | 'SUSPENSION' | 'OTHER';
const TYPE_LABEL: Record<DType, string> = {
    VERBAL_WARNING: 'Teguran Lisan', SP1: 'SP1', SP2: 'SP2', SP3: 'SP3', SUSPENSION: 'Skorsing', OTHER: 'Lainnya',
};

function isActive(expiryDate: Date | string | null): boolean {
    if (!expiryDate) return true;
    return new Date(expiryDate) >= new Date();
}

export function DisciplinaryManager() {
    const [employees, setEmployees] = useState<{ id: string; name: string; code: string }[]>([]);
    const [actions, setActions] = useState<Array<{
        id: string; employee?: { code: string; name: string };
        type: 'VERBAL_WARNING' | 'SP1' | 'SP2' | 'SP3' | 'SUSPENSION' | 'OTHER';
        reason: string; effectiveDate: string | Date; expiryDate: string | Date | null;
        documentUrl?: string | null;
    }>>([]);
    const [loading, setLoading] = useState(false);
    const [recap, setRecap] = useState<{
        total: number;
        activeCount: number;
        byType: Array<{ type: string; count: number }>;
    } | null>(null);

    const [form, setForm] = useState({
        employeeId: '',
        type: 'SP1' as DType,
        reason: '',
        effectiveDate: '',
        expiryDate: '',
        notes: '',
    });
    const [docFile, setDocFile] = useState<File | null>(null);

    const load = async () => {
        setLoading(true);
        const [empRes, actRes, recapRes] = await Promise.all([
            getEmployees(),
            listDisciplinaryActions(),
            getDisciplinaryRecap(),
        ]);
        if (empRes.success && Array.isArray(empRes.data)) {
            setEmployees(empRes.data.map((e: { id: string; name: string; code: string }) => ({ id: e.id, name: e.name, code: e.code })));
        }
        setActions(actRes.success ? actRes.data ?? [] : []);
        setRecap(recapRes.success ? (recapRes.data ?? null) : null);
        setLoading(false);
    };

    useEffect(() => { load(); }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.employeeId || !form.reason || !form.effectiveDate) {
            toast.error('Lengkapi field wajib (karyawan, alasan, tanggal berlaku)');
            return;
        }
        try {
            let documentUrl: string | undefined;
            if (docFile) {
                const fd = new FormData();
                fd.append('file', docFile);
                fd.append('entityId', form.employeeId);
                fd.append('category', 'disciplinary');
                const up = await fetch('/api/upload/hrd-doc', { method: 'POST', body: fd });
                if (!up.ok) {
                    toast.error('Gagal upload dokumen sanksi');
                    return;
                }
                const json = (await up.json()) as { publicUrl?: string };
                documentUrl = json.publicUrl;
            }
            const res = await createDisciplinaryAction({
                employeeId: form.employeeId,
                type: form.type,
                reason: form.reason,
                effectiveDate: new Date(form.effectiveDate),
                expiryDate: form.expiryDate ? new Date(form.expiryDate) : undefined,
                notes: form.notes || undefined,
                documentUrl,
            });
            if (res.success) {
                toast.success('Sanksi disiplin dibuat');
                setForm({ employeeId: '', type: 'SP1', reason: '', effectiveDate: '', expiryDate: '', notes: '' });
                setDocFile(null);
                load();
            } else {
                toast.error(res.error || 'Gagal');
            }
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Gagal');
        }
    };

    return (
        <div className="space-y-4">
            {recap && (
                <div className="rounded-lg border bg-card p-4 space-y-2">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-bold uppercase tracking-tight">Rekap Sanksi</h2>
                        <a href="/api/hrd/disciplinary/export">
                            <Button type="button" size="sm" variant="outline" className="h-8 gap-1 text-xs">
                                <Download className="h-3.5 w-3.5" /> CSV
                            </Button>
                        </a>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <div className="rounded-lg bg-muted/40 p-2 text-center">
                            <div className="text-[10px] text-muted-foreground">Total</div>
                            <div className="font-bold">{recap.total}</div>
                        </div>
                        <div className="rounded-lg bg-muted/40 p-2 text-center">
                            <div className="text-[10px] text-muted-foreground">Aktif</div>
                            <div className="font-bold text-red-700">{recap.activeCount}</div>
                        </div>
                        {recap.byType.slice(0, 2).map((t) => (
                            <div key={t.type} className="rounded-lg bg-muted/40 p-2 text-center">
                                <div className="text-[10px] text-muted-foreground">{TYPE_LABEL[t.type as DType] ?? t.type}</div>
                                <div className="font-bold">{t.count}</div>
                            </div>
                        ))}
                    </div>
                    {recap.byType.length > 2 && (
                        <div className="flex flex-wrap gap-1.5 text-[11px]">
                            {recap.byType.map((t) => (
                                <span key={t.type} className="rounded-full bg-muted px-2 py-0.5">
                                    {TYPE_LABEL[t.type as DType] ?? t.type}: {t.count}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            )}
        <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 rounded-lg border bg-card p-4 space-y-3">
                <h2 className="text-sm font-bold uppercase tracking-tight">Tambah Sanksi</h2>
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
                        <Label className="text-xs font-semibold">Jenis Sanksi</Label>
                        <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as DType })}>
                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {(Object.keys(TYPE_LABEL) as DType[]).map((t) => (
                                    <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">Tgl Berlaku</Label>
                            <Input type="date" value={form.effectiveDate} onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })} className="h-9" />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">Tgl Hangus (opsional)</Label>
                            <Input type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} className="h-9" />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs font-semibold">Alasan / Kronologi</Label>
                        <Textarea rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs font-semibold">Catatan (opsional)</Label>
                        <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs font-semibold">Dokumen SP (PDF/foto, opsional)</Label>
                        <Input
                            type="file"
                            accept="image/*,application/pdf"
                            className="h-9 text-xs"
                            onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                        />
                    </div>
                    <Button type="submit" size="sm" disabled={!form.employeeId || !form.reason || !form.effectiveDate}>Simpan</Button>
                </form>
            </div>

            <div className="lg:col-span-2 space-y-3">
                <h2 className="text-sm font-bold uppercase tracking-tight">Riwayat Sanksi</h2>
                <div className="rounded-lg border overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/40 text-left">
                            <tr>
                                <th className="p-2">Karyawan</th>
                                <th className="p-2">Jenis</th>
                                <th className="p-2">Berlaku</th>
                                <th className="p-2">Hangus</th>
                                <th className="p-2">Status</th>
                                <th className="p-2">Alasan</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && (
                                <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Memuat…</td></tr>
                            )}
                            {!loading && actions.length === 0 && (
                                <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Belum ada sanksi tercatat</td></tr>
                            )}
                            {actions.map((a) => {
                                const active = isActive(a.expiryDate);
                                return (
                                    <tr key={a.id} className="border-t">
                                        <td className="p-2">{a.employee?.code} — {a.employee?.name}</td>
                                        <td className="p-2"><span className="font-medium">{TYPE_LABEL[a.type as DType]}</span></td>
                                        <td className="p-2 text-xs">{format(new Date(a.effectiveDate), 'dd MMM yyyy', { locale: id })}</td>
                                        <td className="p-2 text-xs">{a.expiryDate ? format(new Date(a.expiryDate), 'dd MMM yyyy', { locale: id }) : '—'}</td>
                                        <td className="p-2">
                                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${active ? 'bg-red-500/10 text-red-700' : 'bg-muted text-muted-foreground'}`}>
                                                {active ? 'Aktif' : 'Hangus'}
                                            </span>
                                        </td>
                                        <td className="p-2 text-xs text-muted-foreground max-w-[260px] truncate" title={a.reason}>
                                            {a.reason}
                                            {a.documentUrl ? (
                                                <>
                                                    {' · '}
                                                    <a href={a.documentUrl} target="_blank" rel="noreferrer" className="underline">
                                                        Dokumen
                                                    </a>
                                                </>
                                            ) : null}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
        </div>
    );
}
