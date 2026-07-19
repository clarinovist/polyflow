'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { listLoans, createLoan } from '@/actions/hrd/payroll-monthly';
import { getEmployees } from '@/actions/admin/employees';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';

type LoanStatus = 'ACTIVE' | 'PAID_OFF' | 'DEFAULTED';
const STATUS_BADGE: Record<LoanStatus, string> = {
    ACTIVE: 'bg-amber-500/10 text-amber-700',
    PAID_OFF: 'bg-green-500/10 text-green-700',
    DEFAULTED: 'bg-red-500/10 text-red-700',
};

function formatIdr(n: number) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
}

export function LoansManager() {
    const [employees, setEmployees] = useState<{ id: string; name: string; code: string }[]>([]);
    const [loans, setLoans] = useState<Array<{
        id: string; loanNumber: string; date: string | Date; principalAmount: number | { toNumber(): number };
        remainingBalance: number | { toNumber(): number };
        repaymentType: 'INSTALLMENT' | 'FULL_NEXT_MONTH'; status: LoanStatus;
        installmentAmount: number | { toNumber(): number } | null;
        reason: string | null; collateralDescription: string | null;
        employee: { code: string; name: string };
    }>>([]);
    const [loading, setLoading] = useState(false);
    const [filterStatus, setFilterStatus] = useState<'ACTIVE' | 'PAID_OFF' | 'DEFAULTED' | 'ALL'>('ACTIVE');

    const [form, setForm] = useState({
        employeeId: '',
        date: '',
        principalAmount: '',
        reason: '',
        repaymentType: 'INSTALLMENT' as 'INSTALLMENT' | 'FULL_NEXT_MONTH',
        installmentAmount: '',
        collateralDescription: '',
    });

    const load = async () => {
        setLoading(true);
        const [empRes, loanRes] = await Promise.all([
            getEmployees(),
            listLoans(filterStatus === 'ALL' ? undefined : { status: filterStatus }),
        ]);
        if (empRes.success && Array.isArray(empRes.data)) {
            setEmployees(empRes.data.map((e: { id: string; name: string; code: string }) => ({ id: e.id, name: e.name, code: e.code })));
        }
        setLoans(loanRes.success ? (loanRes.data ?? []) : []);
        setLoading(false);
    };

    useEffect(() => { load(); }, [filterStatus]);

    const toN = (v: number | { toNumber(): number } | null | undefined): number => {
        if (v == null) return 0;
        return typeof v === 'number' ? v : v.toNumber();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.employeeId || !form.date || !form.principalAmount) {
            toast.error('Lengkapi field wajib (karyawan, tanggal, jumlah)');
            return;
        }
        try {
            const res = await createLoan({
                employeeId: form.employeeId,
                date: new Date(form.date),
                principalAmount: Number(form.principalAmount),
                reason: form.reason || undefined,
                repaymentType: form.repaymentType,
                installmentAmount: form.repaymentType === 'INSTALLMENT' ? Number(form.installmentAmount) : undefined,
                collateralDescription: form.collateralDescription || undefined,
            });
            if (res.success) {
                toast.success(`Kasbon dibuat: ${res.data.loanNumber}`);
                setForm({ employeeId: '', date: '', principalAmount: '', reason: '', repaymentType: 'INSTALLMENT', installmentAmount: '', collateralDescription: '' });
                load();
            } else {
                toast.error(res.error || 'Gagal');
            }
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Gagal');
        }
    };

    return (
        <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 rounded-lg border bg-card p-4 space-y-3">
                <h2 className="text-sm font-bold uppercase tracking-tight">Pengajuan Kasbon</h2>
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
                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">Tanggal</Label>
                            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="h-9" />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">Jumlah (IDR)</Label>
                            <Input type="number" min="0" step="10000" value={form.principalAmount} onChange={(e) => setForm({ ...form, principalAmount: e.target.value })} className="h-9" />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs font-semibold">Tipe Pelunasan</Label>
                        <Select value={form.repaymentType} onValueChange={(v) => setForm({ ...form, repaymentType: v as typeof form.repaymentType })}>
                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="INSTALLMENT">Cicilan per bulan</SelectItem>
                                <SelectItem value="FULL_NEXT_MONTH">Lunas bulan depan</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    {form.repaymentType === 'INSTALLMENT' && (
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">Cicilan / bulan (IDR)</Label>
                            <Input type="number" min="0" step="10000" value={form.installmentAmount} onChange={(e) => setForm({ ...form, installmentAmount: e.target.value })} className="h-9" />
                        </div>
                    )}
                    <div className="space-y-1">
                        <Label className="text-xs font-semibold">Alasan</Label>
                        <Textarea rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs font-semibold">Jaminan (opsional)</Label>
                        <Input value={form.collateralDescription} onChange={(e) => setForm({ ...form, collateralDescription: e.target.value })} placeholder="BPKB / STPK / dll" className="h-9" />
                    </div>
                    <Button type="submit" size="sm" disabled={!form.employeeId || !form.date || !form.principalAmount}>Ajukan Kasbon</Button>
                </form>
            </div>

            <div className="lg:col-span-2 space-y-3">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold uppercase tracking-tight">Daftar Kasbon</h2>
                    <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as typeof filterStatus)}>
                        <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ACTIVE">Aktif</SelectItem>
                            <SelectItem value="PAID_OFF">Lunas</SelectItem>
                            <SelectItem value="DEFAULTED">Macet</SelectItem>
                            <SelectItem value="ALL">Semua</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="rounded-lg border overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/40 text-left">
                            <tr>
                                <th className="p-2">No. Kasbon</th>
                                <th className="p-2">Karyawan</th>
                                <th className="p-2">Tanggal</th>
                                <th className="p-2 text-right">Pokok</th>
                                <th className="p-2 text-right">Sisa</th>
                                <th className="p-2">Tipe</th>
                                <th className="p-2">Status</th>
                                <th className="p-2">Jaminan</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && <tr><td colSpan={8} className="p-4 text-center text-muted-foreground">Memuat…</td></tr>}
                            {!loading && loans.length === 0 && <tr><td colSpan={8} className="p-4 text-center text-muted-foreground">Belum ada kasbon</td></tr>}
                            {loans.map((l) => (
                                <tr key={l.id} className="border-t">
                                    <td className="p-2 font-mono text-xs">{l.loanNumber}</td>
                                    <td className="p-2">{l.employee.code} — {l.employee.name}</td>
                                    <td className="p-2 text-xs">{format(new Date(l.date), 'dd MMM yyyy', { locale: id })}</td>
                                    <td className="p-2 text-right">{formatIdr(toN(l.principalAmount))}</td>
                                    <td className="p-2 text-right font-semibold">{formatIdr(toN(l.remainingBalance))}</td>
                                    <td className="p-2 text-xs">
                                        {l.repaymentType === 'INSTALLMENT'
                                            ? `Cicilan ${formatIdr(toN(l.installmentAmount))}/bln`
                                            : 'Lunas bulan depan'}
                                    </td>
                                    <td className="p-2">
                                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[l.status]}`}>{l.status}</span>
                                    </td>
                                    <td className="p-2 text-xs text-muted-foreground max-w-[180px] truncate" title={l.collateralDescription ?? ''}>{l.collateralDescription ?? '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
