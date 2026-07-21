'use client';

import { useState, useEffect, Fragment } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { listLoans, createLoan, markLoanDefaulted, getLoanPortfolioSummary } from '@/actions/hrd/payroll-monthly';
import { getEmployees } from '@/actions/admin/employees';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { Download } from 'lucide-react';

type LoanStatus = 'ACTIVE' | 'PAID_OFF' | 'DEFAULTED';
const STATUS_BADGE: Record<LoanStatus, string> = {
    ACTIVE: 'bg-amber-500/10 text-amber-700',
    PAID_OFF: 'bg-green-500/10 text-green-700',
    DEFAULTED: 'bg-red-500/10 text-red-700',
};

function formatIdr(n: number) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
}

const toN = (v: number | { toNumber(): number } | null | undefined): number => {
    if (v == null) return 0;
    return typeof v === 'number' ? v : v.toNumber();
};

async function uploadLoanDoc(file: File, entityId: string): Promise<string | null> {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('entityId', entityId);
    fd.append('category', 'loan');
    const res = await fetch('/api/upload/hrd-doc', { method: 'POST', body: fd });
    if (!res.ok) return null;
    const json = (await res.json()) as { publicUrl?: string };
    return json.publicUrl ?? null;
}

export function LoansManager() {
    const [employees, setEmployees] = useState<{ id: string; name: string; code: string }[]>([]);
    const [loans, setLoans] = useState<
        Array<{
            id: string;
            loanNumber: string;
            date: string | Date;
            principalAmount: number | { toNumber(): number };
            remainingBalance: number | { toNumber(): number };
            repaymentType: 'INSTALLMENT' | 'FULL_NEXT_MONTH';
            status: LoanStatus;
            installmentAmount: number | { toNumber(): number } | null;
            reason: string | null;
            collateralDescription: string | null;
            collateralPhotoUrl: string | null;
            employee: { code: string; name: string };
            payments: Array<{
                id: string;
                amount: number | { toNumber(): number };
                date: string | Date;
                notes: string | null;
            }>;
        }>
    >([]);
    const [loading, setLoading] = useState(false);
    const [filterStatus, setFilterStatus] = useState<'ACTIVE' | 'PAID_OFF' | 'DEFAULTED' | 'ALL'>('ACTIVE');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [collateralFile, setCollateralFile] = useState<File | null>(null);
    const [portfolio, setPortfolio] = useState<{
        activeCount: number;
        paidOffCount: number;
        defaultedCount: number;
        sumPrincipalActive: number;
        sumRemainingActive: number;
    } | null>(null);

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
        const [empRes, loanRes, portRes] = await Promise.all([
            getEmployees(),
            listLoans(filterStatus === 'ALL' ? undefined : { status: filterStatus }),
            getLoanPortfolioSummary(),
        ]);
        if (empRes.success && Array.isArray(empRes.data)) {
            setEmployees(
                empRes.data.map((e: { id: string; name: string; code: string }) => ({
                    id: e.id,
                    name: e.name,
                    code: e.code,
                })),
            );
        }
        setLoans(loanRes.success ? (loanRes.data ?? []) : []);
        setPortfolio(portRes.success ? (portRes.data ?? null) : null);
        setLoading(false);
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filterStatus]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.employeeId || !form.date || !form.principalAmount) {
            toast.error('Lengkapi field wajib (karyawan, tanggal, jumlah)');
            return;
        }
        try {
            let collateralPhotoUrl: string | undefined;
            if (collateralFile) {
                const url = await uploadLoanDoc(collateralFile, form.employeeId);
                if (!url) {
                    toast.error('Gagal upload foto jaminan');
                    return;
                }
                collateralPhotoUrl = url;
            }
            const res = await createLoan({
                employeeId: form.employeeId,
                date: new Date(form.date),
                principalAmount: Number(form.principalAmount),
                reason: form.reason || undefined,
                repaymentType: form.repaymentType,
                installmentAmount:
                    form.repaymentType === 'INSTALLMENT' ? Number(form.installmentAmount) : undefined,
                collateralDescription: form.collateralDescription || undefined,
                collateralPhotoUrl,
            });
            if (res.success) {
                toast.success(`Kasbon dibuat: ${res.data.loanNumber}`);
                setForm({
                    employeeId: '',
                    date: '',
                    principalAmount: '',
                    reason: '',
                    repaymentType: 'INSTALLMENT',
                    installmentAmount: '',
                    collateralDescription: '',
                });
                setCollateralFile(null);
                load();
            } else {
                toast.error(res.error || 'Gagal');
            }
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Gagal');
        }
    };

    const handleDefaulted = async (id: string, loanNumber: string) => {
        if (!confirm(`Tandai kasbon ${loanNumber} sebagai DEFAULTED (macet)?`)) return;
        const res = await markLoanDefaulted(id);
        if (res.success) {
            toast.success('Kasbon ditandai DEFAULTED');
            load();
        } else {
            toast.error(res.error || 'Gagal');
        }
    };

    return (
        <div className="space-y-4">
            {portfolio && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="rounded-xl border bg-card p-3">
                        <div className="text-[10px] uppercase text-muted-foreground font-medium">Aktif</div>
                        <div className="text-lg font-bold">{portfolio.activeCount}</div>
                    </div>
                    <div className="rounded-xl border bg-card p-3">
                        <div className="text-[10px] uppercase text-muted-foreground font-medium">Sisa Outstanding</div>
                        <div className="text-lg font-bold text-amber-700">{formatIdr(portfolio.sumRemainingActive)}</div>
                    </div>
                    <div className="rounded-xl border bg-card p-3">
                        <div className="text-[10px] uppercase text-muted-foreground font-medium">Pokok Aktif</div>
                        <div className="text-lg font-bold">{formatIdr(portfolio.sumPrincipalActive)}</div>
                    </div>
                    <div className="rounded-xl border bg-card p-3">
                        <div className="text-[10px] uppercase text-muted-foreground font-medium">Lunas / Macet</div>
                        <div className="text-lg font-bold">{portfolio.paidOffCount} / {portfolio.defaultedCount}</div>
                    </div>
                </div>
            )}
        <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 rounded-lg border bg-card p-4 space-y-3">
                <h2 className="text-sm font-bold uppercase tracking-tight">Pengajuan Kasbon</h2>
                <form onSubmit={handleSubmit} className="space-y-3">
                    <div className="space-y-1">
                        <Label className="text-xs font-semibold">Karyawan</Label>
                        <Select value={form.employeeId} onValueChange={(v) => setForm({ ...form, employeeId: v })}>
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
                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">Tanggal</Label>
                            <Input
                                type="date"
                                value={form.date}
                                onChange={(e) => setForm({ ...form, date: e.target.value })}
                                className="h-9"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">Jumlah (IDR)</Label>
                            <Input
                                type="number"
                                min="0"
                                step="10000"
                                value={form.principalAmount}
                                onChange={(e) => setForm({ ...form, principalAmount: e.target.value })}
                                className="h-9"
                            />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs font-semibold">Tipe Pelunasan</Label>
                        <Select
                            value={form.repaymentType}
                            onValueChange={(v) =>
                                setForm({ ...form, repaymentType: v as typeof form.repaymentType })
                            }
                        >
                            <SelectTrigger className="h-9">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="INSTALLMENT">Cicilan per bulan</SelectItem>
                                <SelectItem value="FULL_NEXT_MONTH">Lunas bulan depan</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    {form.repaymentType === 'INSTALLMENT' && (
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">Cicilan / bulan (IDR)</Label>
                            <Input
                                type="number"
                                min="0"
                                step="10000"
                                value={form.installmentAmount}
                                onChange={(e) => setForm({ ...form, installmentAmount: e.target.value })}
                                className="h-9"
                            />
                        </div>
                    )}
                    <div className="space-y-1">
                        <Label className="text-xs font-semibold">Alasan</Label>
                        <Textarea
                            rows={2}
                            value={form.reason}
                            onChange={(e) => setForm({ ...form, reason: e.target.value })}
                        />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs font-semibold">Jaminan (opsional)</Label>
                        <Input
                            value={form.collateralDescription}
                            onChange={(e) => setForm({ ...form, collateralDescription: e.target.value })}
                            placeholder="BPKB / STPK / dll"
                            className="h-9"
                        />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs font-semibold">Foto jaminan (opsional)</Label>
                        <Input
                            type="file"
                            accept="image/*,application/pdf"
                            className="h-9 text-xs"
                            onChange={(e) => setCollateralFile(e.target.files?.[0] ?? null)}
                        />
                    </div>
                    <Button
                        type="submit"
                        size="sm"
                        disabled={!form.employeeId || !form.date || !form.principalAmount}
                    >
                        Ajukan Kasbon
                    </Button>
                </form>
            </div>

            <div className="lg:col-span-2 space-y-3">
                <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-bold uppercase tracking-tight">Daftar Kasbon</h2>
                    <div className="flex items-center gap-2">
                        <a href={`/api/hrd/loans/export?status=${filterStatus}`}>
                            <Button type="button" size="sm" variant="outline" className="h-8 gap-1 text-xs">
                                <Download className="h-3.5 w-3.5" /> CSV
                            </Button>
                        </a>
                        <Select
                            value={filterStatus}
                            onValueChange={(v) => setFilterStatus(v as typeof filterStatus)}
                        >
                            <SelectTrigger className="h-8 w-36 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ACTIVE">Aktif</SelectItem>
                                <SelectItem value="PAID_OFF">Lunas</SelectItem>
                                <SelectItem value="DEFAULTED">Macet</SelectItem>
                                <SelectItem value="ALL">Semua</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
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
                                <th className="p-2">Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && (
                                <tr>
                                    <td colSpan={8} className="p-4 text-center text-muted-foreground">
                                        Memuat…
                                    </td>
                                </tr>
                            )}
                            {!loading && loans.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="p-4 text-center text-muted-foreground">
                                        Belum ada kasbon
                                    </td>
                                </tr>
                            )}
                            {loans.map((l) => (
                                <Fragment key={l.id}>
                                    <tr className="border-t">
                                        <td className="p-2 font-mono text-xs">{l.loanNumber}</td>
                                        <td className="p-2">
                                            {l.employee.code} — {l.employee.name}
                                        </td>
                                        <td className="p-2 text-xs">
                                            {format(new Date(l.date), 'dd MMM yyyy', { locale: id })}
                                        </td>
                                        <td className="p-2 text-right">{formatIdr(toN(l.principalAmount))}</td>
                                        <td className="p-2 text-right font-semibold">
                                            {formatIdr(toN(l.remainingBalance))}
                                        </td>
                                        <td className="p-2 text-xs">
                                            {l.repaymentType === 'INSTALLMENT'
                                                ? `Cicilan ${formatIdr(toN(l.installmentAmount))}/bln`
                                                : 'Lunas bulan depan'}
                                        </td>
                                        <td className="p-2">
                                            <span
                                                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[l.status]}`}
                                            >
                                                {l.status}
                                            </span>
                                        </td>
                                        <td className="p-2 space-x-1">
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-7 text-xs"
                                                onClick={() =>
                                                    setExpandedId(expandedId === l.id ? null : l.id)
                                                }
                                            >
                                                {expandedId === l.id ? 'Tutup' : 'Cicilan'}
                                            </Button>
                                            {l.status === 'ACTIVE' && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-7 text-xs text-red-600"
                                                    onClick={() => handleDefaulted(l.id, l.loanNumber)}
                                                >
                                                    Defaulted
                                                </Button>
                                            )}
                                        </td>
                                    </tr>
                                    {expandedId === l.id && (
                                        <tr className="bg-muted/10">
                                            <td colSpan={8} className="p-3 text-xs">
                                                <div className="space-y-1">
                                                    <p className="font-semibold">
                                                        Riwayat cicilan {l.loanNumber}
                                                        {l.collateralDescription
                                                            ? ` · Jaminan: ${l.collateralDescription}`
                                                            : ''}
                                                        {l.collateralPhotoUrl ? (
                                                            <>
                                                                {' · '}
                                                                <a
                                                                    href={l.collateralPhotoUrl}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="underline"
                                                                >
                                                                    Lihat foto
                                                                </a>
                                                            </>
                                                        ) : null}
                                                    </p>
                                                    {(l.payments?.length ?? 0) === 0 && (
                                                        <p className="text-muted-foreground">
                                                            Belum ada pembayaran
                                                        </p>
                                                    )}
                                                    {l.payments?.map((p) => (
                                                        <div
                                                            key={p.id}
                                                            className="flex justify-between border-b border-border/40 py-1"
                                                        >
                                                            <span>
                                                                {format(new Date(p.date), 'dd MMM yyyy', {
                                                                    locale: id,
                                                                })}
                                                                {p.notes ? ` — ${p.notes}` : ''}
                                                            </span>
                                                            <span className="font-medium">
                                                                {formatIdr(toN(p.amount))}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
        </div>
    );
}
