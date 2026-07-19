'use client';

import { useEffect, useState } from 'react';
import { listDisciplinaryActions, listLeaveRequests } from '@/actions/hrd/disciplinary-leave';
import { listLoans } from '@/actions/hrd/payroll-monthly';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';

type Tab = 'disciplinary' | 'leave' | 'loans';

export function EmployeeHrHistory({ employeeId }: { employeeId: string }) {
    const [tab, setTab] = useState<Tab>('disciplinary');
    const [loading, setLoading] = useState(false);
    const [disciplinary, setDisciplinary] = useState<
        Array<{
            id: string;
            type: string;
            reason: string;
            effectiveDate: string | Date;
            expiryDate: string | Date | null;
            documentUrl?: string | null;
        }>
    >([]);
    const [leaves, setLeaves] = useState<
        Array<{
            id: string;
            type: string;
            status: string;
            startDate: string | Date;
            endDate: string | Date;
            reason: string | null;
        }>
    >([]);
    const [loans, setLoans] = useState<
        Array<{
            id: string;
            loanNumber: string;
            status: string;
            principalAmount: number | { toNumber(): number };
            remainingBalance: number | { toNumber(): number };
            date: string | Date;
        }>
    >([]);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            const [dRes, lRes, kRes] = await Promise.all([
                listDisciplinaryActions(employeeId),
                listLeaveRequests({ employeeId }),
                listLoans({ employeeId }),
            ]);
            setDisciplinary(dRes.success ? (dRes.data ?? []) : []);
            setLeaves(lRes.success ? (lRes.data ?? []) : []);
            setLoans(kRes.success ? (kRes.data ?? []) : []);
            setLoading(false);
        };
        load();
    }, [employeeId]);

    const toN = (v: number | { toNumber(): number }) => (typeof v === 'number' ? v : v.toNumber());
    const fmt = (d: string | Date) => format(new Date(d), 'dd MMM yyyy', { locale: id });

    const tabs: Array<{ id: Tab; label: string }> = [
        { id: 'disciplinary', label: 'Riwayat Disiplin' },
        { id: 'leave', label: 'Riwayat Cuti' },
        { id: 'loans', label: 'Kasbon' },
    ];

    return (
        <div className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex flex-wrap gap-2">
                {tabs.map((t) => (
                    <button
                        key={t.id}
                        type="button"
                        onClick={() => setTab(t.id)}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${
                            tab === t.id
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-muted/30 text-muted-foreground border-border'
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {loading && <p className="text-xs text-muted-foreground">Memuat riwayat…</p>}

            {!loading && tab === 'disciplinary' && (
                <div className="space-y-2 text-sm">
                    {disciplinary.length === 0 && (
                        <p className="text-xs text-muted-foreground">Belum ada sanksi.</p>
                    )}
                    {disciplinary.map((a) => (
                        <div key={a.id} className="border-b border-border/50 py-2">
                            <div className="font-medium">
                                {a.type} · {fmt(a.effectiveDate)}
                                {a.expiryDate ? ` → ${fmt(a.expiryDate)}` : ''}
                            </div>
                            <div className="text-xs text-muted-foreground">{a.reason}</div>
                            {a.documentUrl && (
                                <a
                                    href={a.documentUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-xs underline"
                                >
                                    Lihat dokumen
                                </a>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {!loading && tab === 'leave' && (
                <div className="space-y-2 text-sm">
                    {leaves.length === 0 && <p className="text-xs text-muted-foreground">Belum ada cuti.</p>}
                    {leaves.map((l) => (
                        <div key={l.id} className="border-b border-border/50 py-2">
                            <div className="font-medium">
                                {l.type} · {l.status} · {fmt(l.startDate)} – {fmt(l.endDate)}
                            </div>
                            {l.reason && <div className="text-xs text-muted-foreground">{l.reason}</div>}
                        </div>
                    ))}
                </div>
            )}

            {!loading && tab === 'loans' && (
                <div className="space-y-2 text-sm">
                    {loans.length === 0 && <p className="text-xs text-muted-foreground">Belum ada kasbon.</p>}
                    {loans.map((k) => (
                        <div key={k.id} className="border-b border-border/50 py-2 flex justify-between gap-2">
                            <div>
                                <div className="font-medium">
                                    {k.loanNumber} · {k.status}
                                </div>
                                <div className="text-xs text-muted-foreground">{fmt(k.date)}</div>
                            </div>
                            <div className="text-right text-xs">
                                <div>Pokok: {toN(k.principalAmount).toLocaleString('id-ID')}</div>
                                <div>Sisa: {toN(k.remainingBalance).toLocaleString('id-ID')}</div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
