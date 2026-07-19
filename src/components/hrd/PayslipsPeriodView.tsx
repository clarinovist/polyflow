'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { listPayslipsForPeriod, finalizePayslip, markPayslipPaid, closePayrollPeriod } from '@/actions/hrd/payroll-monthly';
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

    const load = async () => {
        setLoading(true);
        const res = await listPayslipsForPeriod(periodId);
        setPayslips(res.success ? (res.data ?? []) : []);
        setLoading(false);
    };

    useEffect(() => { load(); }, [periodId]);

    const handleFinalize = async (id: string) => {
        const res = await finalizePayslip(id);
        if (res.success) { toast.success('Payslip difinalize'); load(); }
        else toast.error(res.error || 'Gagal');
    };
    const handlePaid = async (id: string) => {
        const res = await markPayslipPaid(id);
        if (res.success) { toast.success('Payslip ditandai PAID'); load(); }
        else toast.error(res.error || 'Gagal');
    };
    const handleClose = async () => {
        if (!confirm('Tutup periode? Hanya bisa jika semua payslip PAID.')) return;
        const res = await closePayrollPeriod(periodId);
        if (res.success) { toast.success('Periode ditutup'); }
        else toast.error(res.error || 'Gagal');
    };

    const totalNet = payslips.reduce((s, p) => s + toN(p.netPay), 0);
    const allPaid = payslips.length > 0 && payslips.every((p) => p.status === 'PAID');

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <Link href="/hrd/payroll-monthly" className="text-xs text-muted-foreground hover:underline">← Daftar periode</Link>
                <Button size="sm" variant="outline" onClick={handleClose} disabled={!allPaid}>Tutup Periode</Button>
            </div>

            <div className="rounded-lg border overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-left">
                        <tr>
                            <th className="p-2">Karyawan</th>
                            <th className="p-2 text-right">Gaji Pokok</th>
                            <th className="p-2 text-right">Tunjangan</th>
                            <th className="p-2 text-right">BPJS</th>
                            <th className="p-2 text-right">Kasbon</th>
                            <th className="p-2 text-right">Prorata</th>
                            <th className="p-2 text-right">Net Pay</th>
                            <th className="p-2">Status</th>
                            <th className="p-2"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && <tr><td colSpan={9} className="p-4 text-center text-muted-foreground">Memuat…</td></tr>}
                        {!loading && payslips.length === 0 && <tr><td colSpan={9} className="p-4 text-center text-muted-foreground">Belum ada payslip — generate dulu</td></tr>}
                        {payslips.map((p) => (
                            <tr key={p.id} className="border-t cursor-pointer hover:bg-muted/20" onClick={() => setSelected(p)}>
                                <td className="p-2">{p.employee.code} — {p.employee.name}</td>
                                <td className="p-2 text-right">{formatIdr(toN(p.baseSalary))}</td>
                                <td className="p-2 text-right">{formatIdr(toN(p.allowanceTotal))}</td>
                                <td className="p-2 text-right text-red-600">-{formatIdr(toN(p.bpjsDeduction))}</td>
                                <td className="p-2 text-right text-red-600">-{formatIdr(toN(p.loanDeduction))}</td>
                                <td className="p-2 text-right text-red-600">-{formatIdr(toN(p.prorationDeduction))}</td>
                                <td className="p-2 text-right font-semibold">{formatIdr(toN(p.netPay))}</td>
                                <td className="p-2">
                                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[p.status]}`}>{p.status}</span>
                                </td>
                                <td className="p-2 text-right" onClick={(e) => e.stopPropagation()}>
                                    {p.status === 'DRAFT' && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleFinalize(p.id)}>Finalize</Button>}
                                    {p.status === 'FINALIZED' && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handlePaid(p.id)}>Tandai Paid</Button>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    {payslips.length > 0 && (
                        <tfoot>
                            <tr className="border-t bg-muted/20 font-semibold">
                                <td className="p-2" colSpan={6}>Total Net Pay</td>
                                <td className="p-2 text-right">{formatIdr(totalNet)}</td>
                                <td colSpan={2}></td>
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>

            {selected && (
                <div className="rounded-lg border p-4 bg-card max-w-md">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-bold">Detail Payslip</h3>
                        <Button size="sm" variant="ghost" className="h-7" onClick={() => setSelected(null)}>×</Button>
                    </div>
                    <div className="text-xs space-y-1">
                        <div className="flex justify-between"><span className="text-muted-foreground">Karyawan</span><span>{selected.employee.code} — {selected.employee.name}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Gaji Pokok</span><span>{formatIdr(toN(selected.baseSalary))}</span></div>
                        {selected.allowances.length > 0 && (
                            <div className="pl-3 space-y-1">
                                {selected.allowances.map((a) => (
                                    <div key={a.id} className="flex justify-between text-muted-foreground">
                                        <span>• {a.name}</span><span>{formatIdr(toN(a.amount))}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="flex justify-between"><span className="text-muted-foreground">BPJS</span><span>-{formatIdr(toN(selected.bpjsDeduction))}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Kasbon</span><span>-{formatIdr(toN(selected.loanDeduction))}</span></div>
                        {selected.loanPayments.length > 0 && (
                            <div className="pl-3 space-y-1">
                                {selected.loanPayments.map((lp) => (
                                    <div key={lp.id} className="flex justify-between text-muted-foreground">
                                        <span>• {lp.loan.loanNumber}</span><span>{formatIdr(toN(lp.amount))}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="flex justify-between"><span className="text-muted-foreground">Prorata (ABSENT)</span><span>-{formatIdr(toN(selected.prorationDeduction))}</span></div>
                        <div className="flex justify-between font-semibold border-t pt-1 mt-1"><span>Net Pay</span><span>{formatIdr(toN(selected.netPay))}</span></div>
                    </div>
                </div>
            )}
        </div>
    );
}
