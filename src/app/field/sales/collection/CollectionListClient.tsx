'use client';

import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Search,
    ArrowLeft,
    AlertCircle,
    Phone,
    MapPin,
    CalendarClock,
    Banknote,
    MessageSquareWarning,
    PhoneOff,
    ChevronDown,
    ChevronUp,
    Clock,
    AlertTriangle,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { formatRupiah } from '@/lib/utils/utils';
import {
    logCollectionActivityAction,
    listCollectionActivitiesAction,
} from '@/actions/sales/collection';

// ── Types ──────────────────────────────────────────────────────────

type InvoiceItem = {
    id: string;
    invoiceNumber: string;
    invoiceDate: Date | string;
    dueDate: Date | string | null;
    totalAmount: number;
    paidAmount: number;
    status: string;
    customerName: string;
    orderNumber: string;
    daysOverdue: number;
    lastPromise: {
        id: string;
        type: string;
        promisedDate: Date | string | null;
        promisedAmount: number | null;
        activityDate: Date | string;
        notes: string | null;
    } | null;
};

type OverduePromise = {
    id: string;
    invoiceId: string;
    invoiceNumber: string;
    promisedDate: Date | string | null;
    promisedAmount: number | null;
    userName: string;
};

type ActivityItem = {
    id: string;
    type: string;
    activityDate: Date | string;
    promisedDate?: Date | string | null;
    promisedAmount?: number | null;
    outcome?: string | null;
    notes?: string | null;
    user?: { name?: string | null } | null;
};

type RawActivityRow = {
    id: string;
    type: string;
    activityDate: string | Date;
    promisedDate?: string | Date | null;
    promisedAmount?: string | number | null;
    outcome?: string | null;
    notes?: string | null;
    user?: { name?: string | null } | null;
};

function mapRawActivities(rows: RawActivityRow[]): ActivityItem[] {
    return rows.map((a) => ({
        id: a.id,
        type: a.type,
        activityDate: a.activityDate,
        promisedDate: a.promisedDate ?? null,
        promisedAmount:
            a.promisedAmount != null ? Number(a.promisedAmount) : null,
        outcome: a.outcome ?? null,
        notes: a.notes ?? null,
        user: a.user ?? null,
    }));
}

const ACTIVITY_TYPE_OPTIONS = [
    { value: 'CALL', label: 'Telepon', icon: Phone },
    { value: 'VISIT', label: 'Kunjungan', icon: MapPin },
    { value: 'PROMISE_TO_PAY', label: 'Janji Bayar', icon: CalendarClock },
    { value: 'PARTIAL_COLLECTED', label: 'Terkumpul Sebagian', icon: Banknote },
    { value: 'DISPUTE', label: 'Sengketa', icon: MessageSquareWarning },
    { value: 'UNREACHABLE', label: 'Tidak Bisa Dihubungi', icon: PhoneOff },
] as const;

const ACTIVITY_LABEL: Record<string, string> = {
    CALL: 'Telepon',
    VISIT: 'Kunjungan',
    PROMISE_TO_PAY: 'Janji Bayar',
    PARTIAL_COLLECTED: 'Terkumpul Sebagian',
    DISPUTE: 'Sengketa',
    UNREACHABLE: 'Tidak Bisa Dihubungi',
};

function getOverdueBadgeStyle(days: number) {
    if (days < 0)
        return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400';
    if (days <= 7)
        return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400';
    if (days <= 30)
        return 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400';
    return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400';
}

function formatOverdueLabel(days: number) {
    if (days < 0) return `Belum jatuh tempo (${Math.abs(days)} hari lagi)`;
    if (days === 0) return 'Jatuh tempo hari ini';
    return `${days} hari overdue`;
}

// ── Component ──────────────────────────────────────────────────────

export function CollectionListClient({
    invoices,
    overduePromises,
}: {
    invoices: InvoiceItem[];
    overduePromises: OverduePromise[];
}) {
    const router = useRouter();
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<
        'ALL' | 'OVERDUE' | 'PROMISE' | 'NO_ACTIVITY'
    >('ALL');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [activitiesByInvoice, setActivitiesByInvoice] = useState<
        Record<string, ActivityItem[]>
    >({});
    const [loadingActivities, setLoadingActivities] = useState<string | null>(
        null,
    );

    // Activity form dialog
    const [dialogOpen, setDialogOpen] = useState(false);
    const [activeInvoiceId, setActiveInvoiceId] = useState<string | null>(null);
    const [formType, setFormType] = useState<string>('CALL');
    const [formPromisedDate, setFormPromisedDate] = useState('');
    const [formPromisedAmount, setFormPromisedAmount] = useState('');
    const [formNotes, setFormNotes] = useState('');
    const [formOutcome, setFormOutcome] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const activeInvoice = useMemo(
        () => invoices.find((i) => i.id === activeInvoiceId) ?? null,
        [invoices, activeInvoiceId],
    );

    const filtered = useMemo(() => {
        return invoices.filter((inv) => {
            const isOverdue = inv.daysOverdue >= 0 || inv.status === 'OVERDUE';
            const hasPromise = !!inv.lastPromise;
            const noActivity = !hasPromise;

            if (filter === 'OVERDUE' && !isOverdue) return false;
            if (filter === 'PROMISE' && !hasPromise) return false;
            if (filter === 'NO_ACTIVITY' && !noActivity) return false;

            if (!search) return true;
            const q = search.toLowerCase();
            return (
                inv.invoiceNumber.toLowerCase().includes(q) ||
                inv.customerName.toLowerCase().includes(q) ||
                inv.orderNumber.toLowerCase().includes(q)
            );
        });
    }, [invoices, search, filter]);

    const totalOutstanding = useMemo(
        () =>
            filtered.reduce(
                (s, inv) => s + (inv.totalAmount - inv.paidAmount),
                0,
            ),
        [filtered],
    );

    const loadHistory = async (invoiceId: string) => {
        if (activitiesByInvoice[invoiceId]) return;
        setLoadingActivities(invoiceId);
        try {
            const res = await listCollectionActivitiesAction({ invoiceId });
            if (res.success && res.data) {
                setActivitiesByInvoice((prev) => ({
                    ...prev,
                    [invoiceId]: mapRawActivities(
                        res.data as unknown as RawActivityRow[],
                    ),
                }));
            }
        } finally {
            setLoadingActivities(null);
        }
    };

    const toggleExpand = async (invoiceId: string) => {
        if (expandedId === invoiceId) {
            setExpandedId(null);
            return;
        }
        setExpandedId(invoiceId);
        await loadHistory(invoiceId);
    };

    const openActivityDialog = (invoiceId: string) => {
        setActiveInvoiceId(invoiceId);
        setFormType('CALL');
        setFormPromisedDate('');
        setFormPromisedAmount('');
        setFormNotes('');
        setFormOutcome('');
        setFormError(null);
        setDialogOpen(true);
    };

    const handleSubmit = async () => {
        if (!activeInvoiceId) return;
        if (formType === 'PROMISE_TO_PAY') {
            if (!formPromisedDate) {
                setFormError(
                    'Tanggal janji bayar wajib diisi untuk tipe Janji Bayar',
                );
                return;
            }
            if (!formPromisedAmount || Number(formPromisedAmount) <= 0) {
                setFormError('Nominal janji bayar wajib diisi dan > 0');
                return;
            }
        }

        setSubmitting(true);
        setFormError(null);
        try {
            const input: {
                invoiceId: string;
                type: string;
                notes?: string;
                outcome?: string;
                promisedDate?: Date;
                promisedAmount?: number;
            } = {
                invoiceId: activeInvoiceId,
                type: formType,
                notes: formNotes || undefined,
                outcome: formOutcome || undefined,
            };
            if (formType === 'PROMISE_TO_PAY') {
                input.promisedDate = new Date(formPromisedDate);
                input.promisedAmount = Number(formPromisedAmount);
            }
            // visitId optional: SKIP auto-link for now — follow-up:
            // kalau ada active check-in visit, bisa diisi di iterasi berikutnya.
            // Field visitId sudah opsional di model.

            const res = await logCollectionActivityAction(
                input as unknown as Parameters<
                    typeof logCollectionActivityAction
                >[0],
            );
            if (!res.success) {
                setFormError(res.error || 'Gagal menyimpan aktivitas');
                return;
            }

            setActivitiesByInvoice((prev) => {
                const copy = { ...prev };
                delete copy[activeInvoiceId];
                return copy;
            });
            const fresh = await listCollectionActivitiesAction({
                invoiceId: activeInvoiceId,
            });
            if (fresh.success && fresh.data) {
                setActivitiesByInvoice((prev) => ({
                    ...prev,
                    [activeInvoiceId]: mapRawActivities(
                        fresh.data as unknown as RawActivityRow[],
                    ),
                }));
            }

            setDialogOpen(false);
            setExpandedId(activeInvoiceId);
        } catch (e: unknown) {
            setFormError(e instanceof Error ? e.message : 'Gagal menyimpan');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="p-4 space-y-4 pb-20">
            {/* Header */}
            <div className="flex items-center gap-3">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => router.push('/field/sales')}
                    className="shrink-0"
                >
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                    <h1 className="text-xl font-bold">Penagihan</h1>
                    <p className="text-sm text-muted-foreground">
                        Catat aktivitas & janji bayar
                    </p>
                </div>
            </div>

            {/* Overdue promises alert */}
            {overduePromises.length > 0 && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 flex gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div className="text-xs">
                        <p className="font-semibold text-amber-800 dark:text-amber-300">
                            {overduePromises.length} janji bayar lewat tanggal
                        </p>
                        <ul className="mt-1 space-y-0.5 text-amber-700 dark:text-amber-400/80">
                            {overduePromises.slice(0, 5).map((p) => (
                                <li key={p.id} className="truncate">
                                    {p.invoiceNumber} —{' '}
                                    {p.promisedAmount != null
                                        ? formatRupiah(p.promisedAmount)
                                        : '-'}{' '}
                                    •{' '}
                                    {p.promisedDate
                                        ? format(
                                              new Date(p.promisedDate),
                                              'dd MMM',
                                          )
                                        : '-'}
                                </li>
                            ))}
                        </ul>
                        {overduePromises.length > 5 && (
                            <p className="mt-1 text-amber-600">
                                +{overduePromises.length - 5} lainnya
                            </p>
                        )}
                    </div>
                </div>
            )}

            {/* Summary */}
            <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 flex items-center justify-between">
                <div className="space-y-1">
                    <p className="text-xs font-semibold text-rose-800 dark:text-rose-300 uppercase tracking-wider">
                        Outstanding (filtered)
                    </p>
                    <p className="text-2xl font-bold text-rose-600 dark:text-rose-400">
                        {formatRupiah(totalOutstanding)}
                    </p>
                </div>
                <Badge variant="secondary" className="text-[10px]">
                    {filtered.length} invoice
                </Badge>
            </div>

            {/* Search + Filter */}
            <div className="space-y-3">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Cari invoice, customer, atau order..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 h-11"
                    />
                </div>

                <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
                    {(
                        [
                            { v: 'ALL', label: `Semua (${invoices.length})` },
                            {
                                v: 'OVERDUE',
                                label: `Overdue (${invoices.filter((i) => i.daysOverdue >= 0 || i.status === 'OVERDUE').length})`,
                            },
                            {
                                v: 'PROMISE',
                                label: `Ada janji (${invoices.filter((i) => !!i.lastPromise).length})`,
                            },
                            {
                                v: 'NO_ACTIVITY',
                                label: `Belum ditagih (${invoices.filter((i) => !i.lastPromise).length})`,
                            },
                        ] as const
                    ).map((opt) => (
                        <button
                            key={opt.v}
                            type="button"
                            onClick={() => setFilter(opt.v)}
                            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                                filter === opt.v
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted text-muted-foreground'
                            }`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* List */}
            {filtered.length === 0 ? (
                <div className="text-center py-12">
                    <AlertCircle className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                    <p className="text-sm text-muted-foreground">
                        {search
                            ? 'Piutang tidak ditemukan'
                            : 'Tidak ada piutang outstanding'}
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {filtered.map((inv) => {
                        const remaining = inv.totalAmount - inv.paidAmount;
                        const expanded = expandedId === inv.id;
                        const history = activitiesByInvoice[inv.id] ?? [];
                        const isLoadingHist = loadingActivities === inv.id;

                        return (
                            <div
                                key={inv.id}
                                className="border rounded-xl bg-card shadow-sm overflow-hidden"
                            >
                                {/* Main row */}
                                <div className="p-4 space-y-3">
                                    <div className="flex justify-between items-start gap-2">
                                        <div className="min-w-0">
                                            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                                                {inv.invoiceNumber}
                                            </span>
                                            <h3 className="font-bold text-sm text-foreground truncate mt-0.5">
                                                {inv.customerName}
                                            </h3>
                                            <p className="text-xs text-muted-foreground">
                                                Order:{' '}
                                                <strong className="font-medium text-foreground">
                                                    {inv.orderNumber}
                                                </strong>
                                            </p>
                                        </div>
                                        <Badge
                                            variant="outline"
                                            className={`text-[9px] uppercase font-bold shrink-0 ${getOverdueBadgeStyle(inv.daysOverdue)}`}
                                        >
                                            {formatOverdueLabel(
                                                inv.daysOverdue,
                                            )}
                                        </Badge>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 pt-2.5 border-t text-xs">
                                        <div>
                                            <p className="text-[10px] text-muted-foreground">
                                                Jatuh Tempo
                                            </p>
                                            <p
                                                className={`font-semibold flex items-center gap-1 ${inv.daysOverdue >= 0 ? 'text-destructive' : 'text-foreground'}`}
                                            >
                                                <Clock className="h-3 w-3" />
                                                {inv.dueDate
                                                    ? format(
                                                          new Date(inv.dueDate),
                                                          'dd MMM yyyy',
                                                      )
                                                    : '-'}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[10px] text-muted-foreground">
                                                Sisa Piutang
                                            </p>
                                            <p className="font-bold text-sm text-rose-600 dark:text-rose-400">
                                                {formatRupiah(remaining)}
                                            </p>
                                        </div>
                                    </div>

                                    {inv.lastPromise && (
                                        <div className="flex gap-2 items-center p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 text-xs">
                                            <CalendarClock className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                                            <span className="text-amber-800 dark:text-amber-300">
                                                Janji:{' '}
                                                <strong>
                                                    {inv.lastPromise
                                                        .promisedDate
                                                        ? format(
                                                              new Date(
                                                                  inv
                                                                      .lastPromise
                                                                      .promisedDate,
                                                              ),
                                                              'dd MMM yyyy',
                                                          )
                                                        : '-'}
                                                </strong>{' '}
                                                •{' '}
                                                {inv.lastPromise
                                                    .promisedAmount != null
                                                    ? formatRupiah(
                                                          inv.lastPromise
                                                              .promisedAmount,
                                                      )
                                                    : '-'}
                                            </span>
                                        </div>
                                    )}

                                    <div className="flex gap-2">
                                        <Button
                                            size="sm"
                                            className="flex-1 h-9 text-xs"
                                            onClick={() =>
                                                openActivityDialog(inv.id)
                                            }
                                        >
                                            Catat Aktivitas
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-9 text-xs"
                                            onClick={() => toggleExpand(inv.id)}
                                        >
                                            {expanded ? (
                                                <ChevronUp className="h-4 w-4" />
                                            ) : (
                                                <ChevronDown className="h-4 w-4" />
                                            )}
                                            <span className="ml-1">
                                                {expanded ? 'Tutup' : 'Riwayat'}
                                            </span>
                                        </Button>
                                    </div>
                                </div>

                                {/* Expandable history */}
                                {expanded && (
                                    <div className="border-t bg-muted/30 p-3 space-y-2">
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                            Riwayat Aktivitas
                                        </p>
                                        {isLoadingHist ? (
                                            <p className="text-xs text-muted-foreground">
                                                Memuat riwayat...
                                            </p>
                                        ) : history.length === 0 ? (
                                            <p className="text-xs text-muted-foreground">
                                                Belum ada aktivitas penagihan
                                                untuk invoice ini.
                                            </p>
                                        ) : (
                                            <div className="space-y-2">
                                                {history.map((a) => (
                                                    <div
                                                        key={a.id}
                                                        className="p-2.5 rounded-lg bg-card border text-xs space-y-1"
                                                    >
                                                        <div className="flex justify-between gap-2">
                                                            <span className="font-semibold">
                                                                {ACTIVITY_LABEL[
                                                                    a.type
                                                                ] ?? a.type}
                                                            </span>
                                                            <span className="text-[10px] text-muted-foreground">
                                                                {format(
                                                                    new Date(
                                                                        a.activityDate,
                                                                    ),
                                                                    'dd MMM yyyy, HH:mm',
                                                                )}
                                                            </span>
                                                        </div>
                                                        {a.type ===
                                                            'PROMISE_TO_PAY' && (
                                                            <div className="flex gap-2 text-[11px]">
                                                                <span>
                                                                    Janji:{' '}
                                                                    {a.promisedDate
                                                                        ? format(
                                                                              new Date(
                                                                                  a.promisedDate,
                                                                              ),
                                                                              'dd MMM yyyy',
                                                                          )
                                                                        : '-'}
                                                                </span>
                                                                <span>
                                                                    •{' '}
                                                                    {a.promisedAmount !=
                                                                    null
                                                                        ? formatRupiah(
                                                                              a.promisedAmount,
                                                                          )
                                                                        : '-'}
                                                                </span>
                                                            </div>
                                                        )}
                                                        {a.outcome && (
                                                            <p className="text-muted-foreground">
                                                                Outcome:{' '}
                                                                {a.outcome}
                                                            </p>
                                                        )}
                                                        {a.notes && (
                                                            <p className="italic leading-relaxed">
                                                                &quot;
                                                                {a.notes}&quot;
                                                            </p>
                                                        )}
                                                        {a.user?.name && (
                                                            <p className="text-[10px] text-muted-foreground">
                                                                oleh{' '}
                                                                {a.user.name}
                                                            </p>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Activity Dialog */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-base">
                            Catat Aktivitas —{' '}
                            {activeInvoice?.invoiceNumber ?? ''}
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4 pt-1">
                        {activeInvoice && (
                            <div className="p-2.5 rounded-lg bg-muted/50 text-xs space-y-1">
                                <p className="font-semibold">
                                    {activeInvoice.customerName}
                                </p>
                                <p className="text-muted-foreground">
                                    Sisa:{' '}
                                    {formatRupiah(
                                        activeInvoice.totalAmount -
                                            activeInvoice.paidAmount,
                                    )}
                                </p>
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <Label className="text-xs">Tipe Aktivitas</Label>
                            <Select
                                value={formType}
                                onValueChange={setFormType}
                            >
                                <SelectTrigger className="h-9">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {ACTIVITY_TYPE_OPTIONS.map((opt) => (
                                        <SelectItem
                                            key={opt.value}
                                            value={opt.value}
                                        >
                                            {opt.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {formType === 'PROMISE_TO_PAY' && (
                            <>
                                <div className="space-y-1.5">
                                    <Label className="text-xs">
                                        Tanggal Janji Bayar *
                                    </Label>
                                    <Input
                                        type="date"
                                        value={formPromisedDate}
                                        onChange={(e) =>
                                            setFormPromisedDate(e.target.value)
                                        }
                                        className="h-9"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs">
                                        Nominal Janji (Rp) *
                                    </Label>
                                    <Input
                                        type="number"
                                        min={0}
                                        value={formPromisedAmount}
                                        onChange={(e) =>
                                            setFormPromisedAmount(
                                                e.target.value,
                                            )
                                        }
                                        placeholder="500000"
                                        className="h-9"
                                    />
                                </div>
                            </>
                        )}

                        <div className="space-y-1.5">
                            <Label className="text-xs">
                                Outcome (opsional)
                            </Label>
                            <Input
                                value={formOutcome}
                                onChange={(e) => setFormOutcome(e.target.value)}
                                placeholder="Mis. Customer janji transfer besok"
                                className="h-9"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs">Catatan</Label>
                            <Textarea
                                value={formNotes}
                                onChange={(e) => setFormNotes(e.target.value)}
                                placeholder="Catatan penagihan..."
                                rows={3}
                            />
                            <p className="text-[10px] text-muted-foreground">
                                {/* ponytail: visitId auto-link skipped for now; field optional in model.
                                    Upgrade path: read active SalesVisit from workstream 02 check-in state (localStorage or action) and pass visitId here. */}
                                Kaitan otomatis ke visit check-in aktif belum
                                diaktifkan (field visitId opsional) — akan
                                ditambah setelah workstream 02 stabil.
                            </p>
                        </div>

                        {formError && (
                            <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 text-xs text-red-700 dark:text-red-400">
                                {formError}
                            </div>
                        )}

                        <div className="flex gap-2 pt-1">
                            <Button
                                variant="outline"
                                className="flex-1"
                                onClick={() => setDialogOpen(false)}
                                disabled={submitting}
                            >
                                Batal
                            </Button>
                            <Button
                                className="flex-1"
                                onClick={handleSubmit}
                                disabled={submitting}
                            >
                                {submitting ? 'Menyimpan...' : 'Simpan'}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
