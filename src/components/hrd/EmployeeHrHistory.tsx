'use client';

import { useCallback, useEffect, useState } from 'react';
import { listDisciplinaryActions, listLeaveRequests } from '@/actions/hrd/disciplinary-leave';
import { listLoans } from '@/actions/hrd/payroll-monthly';
import { listSalaryHistory } from '@/actions/hrd/salary-history';
import {
    listEmployeeDocuments,
    createEmployeeDocument,
    archiveEmployeeDocument,
    restoreEmployeeDocument,
} from '@/actions/hrd/employee-document';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    EMPLOYEE_DOCUMENT_CATEGORIES,
    employeeDocumentCategoryLabels,
} from '@/lib/labels/hrd-employees';

type Tab = 'disciplinary' | 'leave' | 'loans' | 'salary' | 'documents';

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
    const [salaryHistory, setSalaryHistory] = useState<
        Array<{
            id: string;
            changedAt: string | Date;
            payType: string | null;
            dailyRate: number | null;
            monthlySalary: number | null;
            changes: Record<string, { from: unknown; to: unknown }> | null;
            changedBy: { name: string | null } | null;
        }>
    >([]);
    const [documents, setDocuments] = useState<
        Array<{
            id: string;
            category: string;
            name: string;
            fileUrl: string;
            status: string;
            createdAt: string | Date;
        }>
    >([]);
    const [showArchived, setShowArchived] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [docForm, setDocForm] = useState({
        category: 'KTP' as string,
        name: '',
        notes: '',
    });
    const [docFile, setDocFile] = useState<File | null>(null);

    const loadDocs = useCallback(async (archived = false) => {
        const sRes = await listEmployeeDocuments(employeeId, archived);
        setDocuments(sRes.success ? (sRes.data ?? []) : []);
    }, [employeeId]);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            const [dRes, lRes, kRes, sRes] = await Promise.all([
                listDisciplinaryActions(employeeId),
                listLeaveRequests({ employeeId }),
                listLoans({ employeeId }),
                listSalaryHistory(employeeId),
            ]);
            setDisciplinary(dRes.success ? (dRes.data ?? []) : []);
            setLeaves(lRes.success ? (lRes.data ?? []) : []);
            setLoans(kRes.success ? (kRes.data ?? []) : []);
            setSalaryHistory(
                (sRes.success ? (sRes.data ?? []) : []).map((s: Record<string, unknown>) => ({
                    id: s.id as string,
                    changedAt: s.changedAt as string | Date,
                    payType: (s.payType as string) ?? null,
                    dailyRate: s.dailyRate != null ? Number(s.dailyRate) : null,
                    monthlySalary: s.monthlySalary != null ? Number(s.monthlySalary) : null,
                    changes: (s.changes as Record<string, { from: unknown; to: unknown }>) ?? null,
                    changedBy: (s.changedBy as { name: string | null }) ?? null,
                })),
            );
            await loadDocs(false);
            setLoading(false);
        };
        load();
    }, [employeeId, loadDocs]);

    const toN = (v: number | { toNumber(): number }) => (typeof v === 'number' ? v : v.toNumber());
    const fmt = (d: string | Date) => format(new Date(d), 'dd MMM yyyy', { locale: id });

    const handleUploadDocument = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!docForm.name.trim()) {
            toast.error('Judul dokumen wajib diisi');
            return;
        }
        if (!docFile) {
            toast.error('Pilih file dokumen');
            return;
        }
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append('file', docFile);
            fd.append('entityId', employeeId);
            fd.append('category', 'employee');
            const up = await fetch('/api/upload/hrd-doc', { method: 'POST', body: fd });
            if (!up.ok) {
                const err = (await up.json().catch(() => ({}))) as { error?: string };
                toast.error(err.error || 'Gagal upload file');
                return;
            }
            const json = (await up.json()) as { publicUrl?: string };
            if (!json.publicUrl) {
                toast.error('Upload gagal: URL tidak diterima');
                return;
            }
            const res = await createEmployeeDocument({
                employeeId,
                category: docForm.category,
                name: docForm.name.trim(),
                fileUrl: json.publicUrl,
                fileSize: docFile.size,
                mimeType: docFile.type,
                notes: docForm.notes.trim() || undefined,
            });
            if (res.success) {
                toast.success('Dokumen diunggah');
                setDocForm({ category: 'KTP', name: '', notes: '' });
                setDocFile(null);
                await loadDocs(showArchived);
            } else {
                toast.error(res.error || 'Gagal menyimpan dokumen');
            }
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Gagal upload');
        } finally {
            setUploading(false);
        }
    };

    const tabs: Array<{ id: Tab; label: string }> = [
        { id: 'disciplinary', label: 'Riwayat Disiplin' },
        { id: 'leave', label: 'Riwayat Cuti' },
        { id: 'loans', label: 'Kasbon' },
        { id: 'salary', label: 'Riwayat Gaji' },
        { id: 'documents', label: 'Dokumen' },
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

            {!loading && tab === 'salary' && (
                <div className="space-y-2 text-sm">
                    {salaryHistory.length === 0 && (
                        <p className="text-xs text-muted-foreground">Belum ada riwayat perubahan gaji.</p>
                    )}
                    {salaryHistory.map((s) => (
                        <div key={s.id} className="border-b border-border/50 py-2">
                            <div className="flex justify-between items-start">
                                <div className="font-medium">{fmt(s.changedAt)}</div>
                                {s.changedBy && (
                                    <span className="text-xs text-muted-foreground">oleh {s.changedBy.name}</span>
                                )}
                            </div>
                            {s.changes && (
                                <div className="mt-1 space-y-0.5">
                                    {Object.entries(s.changes).map(([field, diff]) => (
                                        <div key={field} className="text-xs text-muted-foreground">
                                            <span className="font-medium">{field}:</span>{' '}
                                            <span className="line-through">{String(diff.from ?? '—')}</span>
                                            {' → '}
                                            <span>{String(diff.to ?? '—')}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {!loading && tab === 'documents' && (
                <div className="space-y-4 text-sm">
                    <form
                        onSubmit={handleUploadDocument}
                        className="rounded-md border border-border/60 bg-muted/10 p-3 space-y-2"
                    >
                        <p className="text-xs font-semibold uppercase tracking-tight text-muted-foreground">
                            Unggah dokumen
                        </p>
                        <div className="grid sm:grid-cols-2 gap-2">
                            <div className="space-y-1">
                                <Label className="text-[10px]">Kategori</Label>
                                <select
                                    className="w-full h-9 rounded-md border bg-background px-2 text-xs"
                                    value={docForm.category}
                                    onChange={(e) => setDocForm({ ...docForm, category: e.target.value })}
                                >
                                    {EMPLOYEE_DOCUMENT_CATEGORIES.map((c) => (
                                        <option key={c} value={c}>
                                            {employeeDocumentCategoryLabels[c] ?? c}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-[10px]">Judul</Label>
                                <Input
                                    className="h-9 text-xs"
                                    placeholder="KTP - Budi Santoso"
                                    value={docForm.name}
                                    onChange={(e) => setDocForm({ ...docForm, name: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px]">File (PDF/JPG/PNG, max 2MB)</Label>
                            <Input
                                type="file"
                                accept="image/*,application/pdf"
                                className="h-9 text-xs"
                                onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px]">Catatan (opsional)</Label>
                            <Input
                                className="h-9 text-xs"
                                value={docForm.notes}
                                onChange={(e) => setDocForm({ ...docForm, notes: e.target.value })}
                            />
                        </div>
                        <Button type="submit" size="sm" disabled={uploading || !docFile || !docForm.name.trim()}>
                            {uploading ? 'Mengunggah…' : 'Unggah dokumen'}
                        </Button>
                    </form>

                    <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">
                            {documents.length === 0 ? 'Belum ada dokumen.' : `${documents.length} dokumen`}
                        </p>
                        <button
                            type="button"
                            className="text-xs underline text-muted-foreground"
                            onClick={async () => {
                                const next = !showArchived;
                                setShowArchived(next);
                                await loadDocs(next);
                            }}
                        >
                            {showArchived ? 'Sembunyikan arsip' : 'Tampilkan arsip'}
                        </button>
                    </div>
                    {documents.map((d) => (
                        <div
                            key={d.id}
                            className="border-b border-border/50 py-2 flex items-start justify-between gap-2"
                        >
                            <div>
                                <div className="font-medium">
                                    <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-muted/50 mr-1.5">
                                        {employeeDocumentCategoryLabels[d.category] ?? d.category}
                                    </span>
                                    {d.name}
                                    {d.status === 'ARCHIVED' && (
                                        <span className="ml-1 text-[10px] text-muted-foreground">(arsip)</span>
                                    )}
                                </div>
                                <div className="text-xs text-muted-foreground">{fmt(d.createdAt)}</div>
                            </div>
                            <div className="flex gap-1 shrink-0">
                                <a
                                    href={d.fileUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-xs underline text-primary"
                                >
                                    Buka
                                </a>
                                {d.status === 'ACTIVE' ? (
                                    <button
                                        type="button"
                                        className="text-xs text-muted-foreground hover:text-foreground"
                                        onClick={async () => {
                                            const res = await archiveEmployeeDocument(d.id);
                                            if (res.success) {
                                                toast.success('Dokumen diarsipkan');
                                                await loadDocs(showArchived);
                                            } else toast.error(res.error || 'Gagal');
                                        }}
                                    >
                                        Arsip
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        className="text-xs text-primary hover:underline"
                                        onClick={async () => {
                                            const res = await restoreEmployeeDocument(d.id);
                                            if (res.success) {
                                                toast.success('Dokumen dipulihkan');
                                                await loadDocs(showArchived);
                                            } else toast.error(res.error || 'Gagal');
                                        }}
                                    >
                                        Pulihkan
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
