'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    listPayslipsForPeriod,
    finalizePayslip,
    markPayslipPaid,
    closePayrollPeriod,
    updateDraftPayslip,
} from '@/actions/hrd/payroll-monthly';
import { toast } from 'sonner';
import Link from 'next/link';

type Payslip = {
    id: string;
    employeeId: string;
    baseSalary: number | { toNumber(): number };
    allowanceTotal: number | { toNumber(): number };
    thrAmount: number | { toNumber(): number };
    prorationDeduction: number | { toNumber(): number };
    grossPay: number | { toNumber(): number };
    bpjsDeduction: number | { toNumber(): number };
    loanDeduction: number | { toNumber(): number };
    otherDeductions: number | { toNumber(): number };
    deductionTotal: number | { toNumber(): number };
    netPay: number | { toNumber(): number };
    status: 'DRAFT' | 'FINALIZED' | 'PAID';
    notes: string | null;
    employee: { code: string; name: string };
    allowances: Array<{ id: string; name: string; amount: number | { toNumber(): number } }>;
    loanPayments: Array<{ id: string; amount: number | { toNumber(): number }; loan: { loanNumber: string } }>;
};

const toN = (v: number | { toNumber(): number } | null | undefined): number => {
    if (v == null) return 0;
    return typeof v === 'number' ? v : v.toNumber();
};

function formatIdr(n: number) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
}

const STATUS_BADGE: Record<Payslip['status'], string> = {
    DRAFT: 'bg-amber-500/10 text-amber-700',
    FINALIZED: 'bg-blue-500/10 text-blue-700',
    PAID: 'bg-green-500/10 text-green-700',
};

export function PayslipsPeriodView({ periodId }: { periodId: string }) {
    const [payslips, setPayslips] = useState<Payslip[]>([]);
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState<Payslip | null>(null);
    const [editForm, setEditForm] = useState({
        thrAmount: '',
        prorationDeduction: '',
        bpjsDeduction: '',
        loanDeduction: '',
        otherDeductions: '',
        notes: '',
    });
    const [saving, setSaving] = useState(false);

    const load = async () => {
        setLoading(true);
        const res = await listPayslipsForPeriod(periodId);
        const data = res.success ? (res.data ?? []) : [];
        setPayslips(data as Payslip[]);
        if (selected) {
            const refreshed = (data as Payslip[]).find((p) => p.id === selected.id) ?? null;
            setSelected(refreshed);
            if (refreshed) syncEditForm(refreshed);
        }
        setLoading(false);
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [periodId]);

    const syncEditForm = (p: Payslip) => {
        setEditForm({
            thrAmount: String(toN(p.thrAmount)),
            prorationDeduction: String(toN(p.prorationDeduction)),
            bpjsDeduction: String(toN(p.bpjsDeduction)),
            loanDeduction: String(toN(p.loanDeduction)),
            otherDeductions: String(toN(p.otherDeductions)),
            notes: p.notes ?? '',
        });
    };

    const openDetail = (p: Payslip) => {
        setSelected(p);
        syncEditForm(p);
    };

    const handleFinalize = async (id: string) => {
        const res = await finalizePayslip(id);
        if (res.success) {
            toast.success('Payslip difinalize');
            load();
        } else toast.error(res.error || 'Gagal');
    };
    const handlePaid = async (id: string) => {
        const res = await markPayslipPaid(id);
        if (res.success) {
            toast.success('Payslip ditandai PAID');
            load();
        } else toast.error(res.error || 'Gagal');
    };
    const handleClose = async () => {
        if (!confirm('Tutup periode? Hanya bisa jika semua payslip PAID.')) return;
        const res = await closePayrollPeriod(periodId);
        if (res.success) {
            toast.success('Periode ditutup');
        } else toast.error(res.error || 'Gagal');
    };

    const handleSaveDraft = async () => {
        if (!selected || selected.status !== 'DRAFT') return;
        setSaving(true);
        try {
            const res = await updateDraftPayslip(selected.id, {
                thrAmount: Number(editForm.thrAmount) || 0,
                prorationDeduction: Number(editForm.prorationDeduction) || 0,
                bpjsDeduction: Number(editForm.bpjsDeduction) || 0,
                loanDeduction: Number(editForm.loanDeduction) || 0,
                otherDeductions: Number(editForm.otherDeductions) || 0,
                notes: editForm.notes || null,
            });
            if (res.success) {
                toast.success('Draft payslip disimpan');
                load();
            } else {
                toast.error(res.error || 'Gagal menyimpan');
            }
        } finally {
            setSaving(false);
        }
    };

    const totalNet = payslips.reduce((s, p) => s + toN(p.netPay), 0);
    const allPaid = payslips.length > 0 && payslips.every((p) => p.status === 'PAID');

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <Link href="/hrd/payroll-monthly" className="text-xs text-muted-foreground hover:underline">
                    ← Daftar periode
                </Link>
                <Button size="sm" variant="outline" onClick={handleClose} disabled={!allPaid}>
                    Tutup Periode
                </Button>
            </div>

            <div className="rounded-lg border overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-left">
                        <tr>
                            <th className="p-2">Karyawan</th>
                            <th className="p-2 text-right">Gaji Pokok</th>
                            <th className="p-2 text-right">Tunjangan</th>
                            <th className="p-2 text-right">THR</th>
                            <th className="p-2 text-right">BPJS</th>
                            <th className="p-2 text-right">Kasbon</th>
                            <th className="p-2 text-right">Prorata</th>
                            <th className="p-2 text-right">Net Pay</th>
                            <th className="p-2">Status</th>
                            <th className="p-2"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <tr>
                                <td colSpan={10} className="p-4 text-center text-muted-foreground">
                                    Memuat…
                                </td>
                            </tr>
                        )}
                        {!loading && payslips.length === 0 && (
                            <tr>
                                <td colSpan={10} className="p-4 text-center text-muted-foreground">
                                    Belum ada payslip — generate dulu
                                </td>
                            </tr>
                        )}
                        {payslips.map((p) => (
                            <tr
                                key={p.id}
                                className="border-t cursor-pointer hover:bg-muted/20"
                                onClick={() => openDetail(p)}
                            >
                                <td className="p-2">
                                    {p.employee.code} — {p.employee.name}
                                </td>
                                <td className="p-2 text-right">{formatIdr(toN(p.baseSalary))}</td>
                                <td className="p-2 text-right">{formatIdr(toN(p.allowanceTotal))}</td>
                                <td className="p-2 text-right">{formatIdr(toN(p.thrAmount))}</td>
                                <td className="p-2 text-right text-red-600">-{formatIdr(toN(p.bpjsDeduction))}</td>
                                <td className="p-2 text-right text-red-600">-{formatIdr(toN(p.loanDeduction))}</td>
                                <td className="p-2 text-right text-red-600">
                                    -{formatIdr(toN(p.prorationDeduction))}
                                </td>
                                <td className="p-2 text-right font-semibold">{formatIdr(toN(p.netPay))}</td>
                                <td className="p-2">
                                    <span
                                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[p.status]}`}
                                    >
                                        {p.status}
                                    </span>
                                </td>
                                <td className="p-2 text-right" onClick={(e) => e.stopPropagation()}>
                                    {p.status === 'DRAFT' && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 text-xs"
                                            onClick={() => handleFinalize(p.id)}
                                        >
                                            Finalize
                                        </Button>
                                    )}
                                    {p.status === 'FINALIZED' && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 text-xs"
                                            onClick={() => handlePaid(p.id)}
                                        >
                                            Tandai Paid
                                        </Button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    {payslips.length > 0 && (
                        <tfoot>
                            <tr className="border-t bg-muted/20 font-semibold">
                                <td className="p-2" colSpan={7}>
                                    Total Net Pay
                                </td>
                                <td className="p-2 text-right">{formatIdr(totalNet)}</td>
                                <td colSpan={2}></td>
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>

            {selected && (
                <div className="rounded-lg border p-4 bg-card max-w-lg space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold">Detail Payslip</h3>
                        <Button size="sm" variant="ghost" className="h-7" onClick={() => setSelected(null)}>
                            ×
                        </Button>
                    </div>
                    <div className="text-xs space-y-1">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Karyawan</span>
                            <span>
                                {selected.employee.code} — {selected.employee.name}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Gaji Pokok</span>
                            <span>{formatIdr(toN(selected.baseSalary))}</span>
                        </div>
                        {selected.allowances.length > 0 && (
                            <div className="pl-3 space-y-1">
                                {selected.allowances.map((a) => (
                                    <div key={a.id} className="flex justify-between text-muted-foreground">
                                        <span>• {a.name}</span>
                                        <span>{formatIdr(toN(a.amount))}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Gross</span>
                            <span>{formatIdr(toN(selected.grossPay))}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Total potongan</span>
                            <span>-{formatIdr(toN(selected.deductionTotal))}</span>
                        </div>
                        {selected.loanPayments.length > 0 && (
                            <div className="pl-3 space-y-1">
                                {selected.loanPayments.map((lp) => (
                                    <div key={lp.id} className="flex justify-between text-muted-foreground">
                                        <span>• {lp.loan.loanNumber}</span>
                                        <span>{formatIdr(toN(lp.amount))}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="flex justify-between font-semibold border-t pt-1 mt-1">
                            <span>Net Pay</span>
                            <span>{formatIdr(toN(selected.netPay))}</span>
                        </div>
                    </div>

                    {selected.status === 'DRAFT' && (
                        <div className="border-t pt-3 space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-tight text-muted-foreground">
                                Koreksi draft
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                    <Label className="text-[10px]">THR</Label>
                                    <Input
                                        type="number"
                                        min="0"
                                        className="h-8 text-xs"
                                        value={editForm.thrAmount}
                                        onChange={(e) => setEditForm({ ...editForm, thrAmount: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-[10px]">BPJS</Label>
                                    <Input
                                        type="number"
                                        min="0"
                                        className="h-8 text-xs"
                                        value={editForm.bpjsDeduction}
                                        onChange={(e) =>
                                            setEditForm({ ...editForm, bpjsDeduction: e.target.value })
                                        }
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-[10px]">Kasbon</Label>
                                    <Input
                                        type="number"
                                        min="0"
                                        className="h-8 text-xs"
                                        value={editForm.loanDeduction}
                                        onChange={(e) =>
                                            setEditForm({ ...editForm, loanDeduction: e.target.value })
                                        }
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-[10px]">Prorata (ABSENT)</Label>
                                    <Input
                                        type="number"
                                        min="0"
                                        className="h-8 text-xs"
                                        value={editForm.prorationDeduction}
                                        onChange={(e) =>
                                            setEditForm({ ...editForm, prorationDeduction: e.target.value })
                                        }
                                    />
                                </div>
                                <div className="space-y-1 col-span-2">
                                    <Label className="text-[10px]">Potongan lain</Label>
                                    <Input
                                        type="number"
                                        min="0"
                                        className="h-8 text-xs"
                                        value={editForm.otherDeductions}
                                        onChange={(e) =>
                                            setEditForm({ ...editForm, otherDeductions: e.target.value })
                                        }
                                    />
                                </div>
                                <div className="space-y-1 col-span-2">
                                    <Label className="text-[10px]">Catatan</Label>
                                    <Input
                                        className="h-8 text-xs"
                                        value={editForm.notes}
                                        onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                                    />
                                </div>
                            </div>
                            <Button size="sm" onClick={handleSaveDraft} disabled={saving}>
                                {saving ? 'Menyimpan…' : 'Simpan koreksi'}
                            </Button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
