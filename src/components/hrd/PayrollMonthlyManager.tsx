'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { listPayrollPeriods, generatePayslips } from '@/actions/hrd/payroll-monthly';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';

type Period = {
    id: string; year: number; month: number;
    status: 'OPEN' | 'CLOSED'; closedAt: string | Date | null;
};

const MONTH_NAMES = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

function badgeClass(s: 'OPEN' | 'CLOSED') {
    return s === 'OPEN' ? 'bg-green-500/10 text-green-700' : 'bg-muted text-muted-foreground';
}

export function PayrollMonthlyManager() {
    const router = useRouter();
    const [periods, setPeriods] = useState<Period[]>([]);
    const [loading, setLoading] = useState(false);
    const [genOpen, setGenOpen] = useState(false);
    const [genForm, setGenForm] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 });
    const [genLoading, setGenLoading] = useState(false);

    const load = async () => {
        setLoading(true);
        const res = await listPayrollPeriods();
        setPeriods(res.success ? (res.data ?? []) : []);
        setLoading(false);
    };

    useEffect(() => { load(); }, []);

    const handleGenerate = async () => {
        setGenLoading(true);
        try {
            const res = await generatePayslips({ year: genForm.year, month: genForm.month });
            if (res.success) {
                const r = res.data!;
                toast.success(`${r.created} payslip dibuat (${r.skipped} dilewati)`);
                setGenOpen(false);
                load();
                router.push(`/hrd/payroll-monthly/${r.periodId}`);
            } else {
                toast.error(res.error || 'Gagal generate');
            }
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Gagal');
        } finally {
            setGenLoading(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-sm font-bold uppercase tracking-tight">Periode Gaji Bulanan</h2>
                    <p className="text-xs text-muted-foreground">Pilih periode atau generate baru untuk karyawan MONTHLY</p>
                </div>
                <Button size="sm" onClick={() => setGenOpen(o => !o)}>{genOpen ? 'Tutup' : 'Generate Periode'}</Button>
            </div>

            {genOpen && (
                <Card className="bg-background/40 border-white/5">
                    <CardContent className="p-4 flex flex-wrap items-end gap-3">
                        <div className="space-y-1">
                            <label className="text-xs font-semibold">Tahun</label>
                            <input type="number" min="2000" max="2100" value={genForm.year}
                                onChange={(e) => setGenForm({ ...genForm, year: Number(e.target.value) })}
                                className="rounded-md border bg-background px-2 py-1 text-sm w-24" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-semibold">Bulan</label>
                            <select value={genForm.month}
                                onChange={(e) => setGenForm({ ...genForm, month: Number(e.target.value) })}
                                className="rounded-md border bg-background px-2 py-1 text-sm h-9">
                                {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                            </select>
                        </div>
                        <Button size="sm" onClick={handleGenerate} disabled={genLoading}>
                            {genLoading ? 'Memproses…' : `Generate ${MONTH_NAMES[genForm.month - 1]} ${genForm.year}`}
                        </Button>
                    </CardContent>
                </Card>
            )}

            <div className="rounded-lg border overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-left">
                        <tr>
                            <th className="p-2">Periode</th>
                            <th className="p-2">Status</th>
                            <th className="p-2">Ditutup</th>
                            <th className="p-2"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">Memuat…</td></tr>}
                        {!loading && periods.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">Belum ada periode — generate baru</td></tr>}
                        {periods.map((p) => (
                            <tr key={p.id} className="border-t hover:bg-muted/20 cursor-pointer"
                                onClick={() => router.push(`/hrd/payroll-monthly/${p.id}`)}>
                                <td className="p-2 font-medium">{MONTH_NAMES[p.month - 1]} {p.year}</td>
                                <td className="p-2">
                                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badgeClass(p.status)}`}>{p.status}</span>
                                </td>
                                <td className="p-2 text-xs text-muted-foreground">
                                    {p.closedAt ? format(new Date(p.closedAt), 'dd MMM yyyy HH:mm', { locale: id }) : '—'}
                                </td>
                                <td className="p-2 text-right">
                                    <Button size="sm" variant="ghost" className="h-7 text-xs">Buka →</Button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
