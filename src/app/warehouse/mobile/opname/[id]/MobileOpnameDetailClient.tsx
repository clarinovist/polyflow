'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    ArrowLeft,
    Search,
    Eye,
    EyeOff,
    Save,
    CheckCircle,
    AlertTriangle,
    ClipboardList,
    RefreshCw,
    Warehouse,
    Plus,
    Loader2,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import {
    saveOpnameCount,
    completeOpname,
    addItemToOpname,
    addOpnameEntry,
    deleteOpnameEntry,
} from '@/actions/inventory/opname';
import { getProductVariants } from '@/actions/production/boms';
import { toast } from 'sonner';
import { formatQuantity } from '@/lib/utils/utils';
import {
    WarehouseAttachmentPanel,
    type AttachmentItem,
} from '@/components/warehouse/WarehouseAttachmentPanel';
import {
    OpnameEntryEditor,
    type OpnameEntryView,
} from '@/components/warehouse/inventory/opname/OpnameEntryEditor';

const MAX_VARIANT_RESULTS = 50;

type OpnameItem = {
    id: string;
    systemQuantity: number;
    countedQuantity: number | null;
    notes: string | null;
    productVariant: {
        name: string;
        skuCode: string;
        primaryUnit: string;
        product: { name: string };
    };
    entries?: Array<{
        id: string;
        quantity: number;
        label?: string | null;
        createdAt: Date | string;
    }>;
};

type OpnameSession = {
    id: string;
    status: string;
    remarks: string | null;
    location?: { name: string } | null;
    createdBy?: { name: string | null } | null;
    items: OpnameItem[];
    opnameNumber: string | null;
};

interface MobileOpnameDetailClientProps {
    session: OpnameSession;
    currentUserId?: string;
    attachments?: AttachmentItem[];
}

type ItemFilter = 'ALL' | 'COUNTED' | 'UNCOUNTED';

function replaceOptimisticEntry(
    entries: OpnameEntryView[],
    optimisticId: string,
    savedEntry: OpnameEntryView,
) {
    let replaced = false;
    const nextEntries = entries.flatMap((entry) => {
        if (entry.id === savedEntry.id) {
            return [];
        }
        if (entry.id === optimisticId) {
            replaced = true;
            return [savedEntry];
        }
        return [entry];
    });

    return replaced ? nextEntries : [...nextEntries, savedEntry];
}

export function MobileOpnameDetailClient({
    session,
    attachments = [],
}: MobileOpnameDetailClientProps) {
    const safeAttachments = Array.isArray(attachments) ? attachments : [];
    const router = useRouter();
    const isOpen = session.status === 'OPEN';

    const [counts, setCounts] = useState<Record<string, string>>({});
    const [notes, setNotes] = useState<Record<string, string>>({});
    const [blindMode, setBlindMode] = useState(false);
    const [search, setSearch] = useState('');
    const [itemFilter, setItemFilter] = useState<ItemFilter>('ALL');
    const [isSaving, setIsSaving] = useState(false);
    const [isFinalizing, setIsFinalizing] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [showVarianceSummary, setShowVarianceSummary] = useState(false);

    // Entry details state
    const [entriesByItem, setEntriesByItem] = useState<
        Record<string, OpnameEntryView[]>
    >({});
    const [expandedItems, setExpandedItems] = useState<
        Record<string, boolean>
    >({});

    // Add Item dialog
    const [addDialogOpen, setAddDialogOpen] = useState(false);
    const [productSearch, setProductSearch] = useState('');
    const [allVariants, setAllVariants] = useState<
        Array<{
            id: string;
            name: string;
            skuCode: string;
            primaryUnit: string;
            product: { name: string };
        }>
    >([]);
    const [isAddingItem, setIsAddingItem] = useState(false);

    // Lazy fetch variants when dialog opens
    useEffect(() => {
        if (addDialogOpen && allVariants.length === 0) {
            getProductVariants()
                .then((result) => {
                    if (result.success && result.data) {
                        setAllVariants(
                            result.data as unknown as typeof allVariants,
                        );
                    } else {
                        toast.error('Gagal memuat varian produk');
                    }
                })
                .catch(() => toast.error('Gagal memuat varian produk'));
        }
    }, [addDialogOpen, allVariants.length]);

    const filteredVariants = useMemo(() => {
        let variants = allVariants;
        if (productSearch) {
            const q = productSearch.toLowerCase();
            variants = variants.filter(
                (v) =>
                    v.name.toLowerCase().includes(q) ||
                    v.skuCode.toLowerCase().includes(q) ||
                    v.product.name.toLowerCase().includes(q),
            );
        }
        return variants.slice(0, MAX_VARIANT_RESULTS);
    }, [allVariants, productSearch]);

    const handleAddItem = async (variantId: string) => {
        setIsAddingItem(true);
        try {
            const result = await addItemToOpname(session.id, variantId);
            if (result.success) {
                toast.success('Item berhasil ditambahkan');
                setAddDialogOpen(false);
                setProductSearch('');
                router.refresh();
            } else {
                toast.error(result.error || 'Gagal menambahkan item');
            }
        } catch {
            toast.error('Gagal menambahkan item');
        } finally {
            setIsAddingItem(false);
        }
    };

    // Initialize state from session
    useEffect(() => {
        const initialCounts: Record<string, string> = {};
        const initialNotes: Record<string, string> = {};
        const items = session.items ?? [];
        items.forEach((item) => {
            if (item.countedQuantity !== null) {
                initialCounts[item.id] = item.countedQuantity.toString();
            }
            if (item.notes) {
                initialNotes[item.id] = item.notes;
            }
        });
        setCounts(initialCounts);
        setNotes(initialNotes);

        // Merge entries: preserve optimistic pending/failed rows that haven't appeared on server yet
        setEntriesByItem((prev) => {
            const next: Record<string, OpnameEntryView[]> = {};
            for (const item of items) {
                const serverEntries: OpnameEntryView[] = (
                    item.entries ?? []
                ).map((entry) => ({
                    id: entry.id,
                    quantity: Number(entry.quantity),
                    label: entry.label ?? null,
                    status: 'saved' as const,
                }));
                const localPendingFailed = (prev[item.id] ?? []).filter(
                    (entry) =>
                        (entry.status === 'pending' ||
                            entry.status === 'failed') &&
                        !serverEntries.some(
                            (serverEntry) => serverEntry.id === entry.id,
                        ),
                );
                next[item.id] = [...serverEntries, ...localPendingFailed];
            }
            return next;
        });

        // Initialize expand state for KG items (don't override user toggle)
        setExpandedItems((prev) => {
            const next: Record<string, boolean> = {};
            for (const item of items) {
                if (prev[item.id] !== undefined) {
                    next[item.id] = prev[item.id];
                } else {
                    next[item.id] = item.productVariant.primaryUnit === 'KG';
                }
            }
            return next;
        });
    }, [session]);

    // Dirty detection
    const dirtyItems = useMemo(() => {
        const dirty: string[] = [];
        const items = session.items ?? [];
        for (const item of items) {
            const currentNote = notes[item.id] || '';
            const originalNote = item.notes || '';
            // Items with entries: countedQuantity is managed server-side by entries; only notes dirty
            const hasEntries = (entriesByItem[item.id] ?? []).length > 0;
            if (hasEntries && currentNote !== originalNote) {
                dirty.push(item.id);
            } else if (!hasEntries) {
                const currentCount = counts[item.id];
                const originalCount =
                    item.countedQuantity !== null
                        ? item.countedQuantity.toString()
                        : '';
                if (
                    currentCount !== originalCount ||
                    currentNote !== originalNote
                ) {
                    dirty.push(item.id);
                }
            }
        }
        return dirty;
    }, [session.items, counts, notes, entriesByItem]);

    const hasChanges = dirtyItems.length > 0;

    // Stats
    const stats = useMemo(() => {
        const items = session.items ?? [];
        const total = items.length;
        const counted = items.filter(
            (item) =>
                counts[item.id] !== undefined && counts[item.id] !== '',
        ).length;
        const uncounted = total - counted;
        let matched = 0;
        let surplus = 0;
        let shortage = 0;

        for (const item of items) {
            const countVal = counts[item.id];
            if (countVal === undefined || countVal === '') continue;
            const actual = parseFloat(countVal);
            if (!Number.isFinite(actual)) continue;
            const system = item.systemQuantity;
            if (actual === system) matched++;
            else if (actual > system) surplus++;
            else shortage++;
        }

        return { total, counted, uncounted, matched, surplus, shortage };
    }, [session.items, counts]);

    // Filtered items
    const filteredItems = useMemo(() => {
        let items = session.items ?? [];

        if (itemFilter === 'COUNTED') {
            items = items.filter((i) => counts[i.id] !== undefined && counts[i.id] !== '');
        } else if (itemFilter === 'UNCOUNTED') {
            items = items.filter(
                (i) => counts[i.id] === undefined || counts[i.id] === '',
            );
        }

        if (search.trim()) {
            const q = search.toLowerCase();
            items = items.filter(
                (i) =>
                    i.productVariant.name.toLowerCase().includes(q) ||
                    i.productVariant.skuCode.toLowerCase().includes(q) ||
                    i.productVariant.product.name.toLowerCase().includes(q),
            );
        }

        return items;
    }, [session.items, itemFilter, search, counts]);

    const handleCountChange = useCallback((id: string, value: string) => {
        setCounts((prev) => ({ ...prev, [id]: value }));
    }, []);

    const handleNoteChange = useCallback((id: string, value: string) => {
        setNotes((prev) => ({ ...prev, [id]: value }));
    }, []);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const updates = dirtyItems.map((id) => ({
                id,
                countedQuantity: parseFloat(counts[id] || '0'),
                notes: notes[id],
            }));
            const result = await saveOpnameCount(session.id, updates);
            if (result.success) {
                toast.success('Perhitungan berhasil disimpan');
                router.refresh();
            } else {
                toast.error(`Gagal: ${result.error}`);
            }
        } catch {
            toast.error('Gagal menyimpan perhitungan');
        } finally {
            setIsSaving(false);
        }
    };

    const handleFinalize = async () => {
        // Guard: reject if any entries are still pending/failed
        const unsavedEntryCount = Object.values(entriesByItem).reduce(
            (total, entries) =>
                total +
                entries.filter(
                    (entry) =>
                        entry.status === 'pending' ||
                        entry.status === 'failed',
                ).length,
            0,
        );

        if (unsavedEntryCount > 0) {
            toast.error(
                `Masih ada ${unsavedEntryCount} entri yang belum tersimpan. Kirim ulang dulu.`,
            );
            return;
        }

        if (stats.uncounted > 0) {
            if (
                !confirm(
                    `Masih ada ${stats.uncounted} item belum dihitung. Lanjutkan finalisasi?`,
                )
            ) {
                return;
            }
        } else if (!confirm('Yakin ingin menyelesaikan sesi ini?')) {
            return;
        }

        setIsFinalizing(true);
        try {
            const result = await completeOpname(session.id);
            if (result.success) {
                toast.success('Sesi berhasil diselesaikan');
                router.refresh();
            } else {
                toast.error(`Gagal: ${result.error}`);
            }
        } catch {
            toast.error('Gagal menyelesaikan sesi');
        } finally {
            setIsFinalizing(false);
        }
    };

    const handleRefresh = () => {
        setIsRefreshing(true);
        router.refresh();
        setTimeout(() => setIsRefreshing(false), 600);
    };

    const handleAddEntry = useCallback(
        async (itemId: string, quantity: number, label?: string) => {
            const clientId = crypto.randomUUID();
            const optimisticEntry: OpnameEntryView = {
                id: clientId,
                quantity,
                label: label ?? null,
                status: 'pending',
            };

            setEntriesByItem((prev) => ({
                ...prev,
                [itemId]: [...(prev[itemId] ?? []), optimisticEntry],
            }));

            try {
                const result = await addOpnameEntry(
                    itemId,
                    quantity,
                    label,
                );
                if (!result.success) {
                    setEntriesByItem((prev) => ({
                        ...prev,
                        [itemId]: (prev[itemId] ?? []).map((entry) =>
                            entry.id === clientId
                                ? { ...entry, status: 'failed' as const }
                                : entry,
                        ),
                    }));
                    toast.error(result.error || 'Gagal menambah entri');
                    return;
                }

                const savedEntry: OpnameEntryView = {
                    id: result.data.id,
                    quantity: result.data.quantity,
                    label: result.data.label ?? null,
                    status: 'saved',
                };
                setEntriesByItem((prev) => ({
                    ...prev,
                    [itemId]: replaceOptimisticEntry(
                        prev[itemId] ?? [],
                        clientId,
                        savedEntry,
                    ),
                }));
                setCounts((prev) => ({
                    ...prev,
                    [itemId]: String(result.data.countedQuantity),
                }));
            } catch {
                setEntriesByItem((prev) => ({
                    ...prev,
                    [itemId]: (prev[itemId] ?? []).map((entry) =>
                        entry.id === clientId
                            ? { ...entry, status: 'failed' as const }
                            : entry,
                    ),
                }));
                toast.error('Gagal menambah entri');
            }
        },
        [],
    );

    const handleRetryEntry = useCallback(
        async (itemId: string, entryId: string) => {
            const entry = (entriesByItem[itemId] ?? []).find(
                (candidate) => candidate.id === entryId,
            );
            if (!entry || entry.status !== 'failed') {
                return;
            }

            setEntriesByItem((prev) => ({
                ...prev,
                [itemId]: (prev[itemId] ?? []).map((candidate) =>
                    candidate.id === entryId
                        ? { ...candidate, status: 'pending' as const }
                        : candidate,
                ),
            }));

            try {
                const result = await addOpnameEntry(
                    itemId,
                    entry.quantity,
                    entry.label ?? undefined,
                );
                if (!result.success) {
                    setEntriesByItem((prev) => ({
                        ...prev,
                        [itemId]: (prev[itemId] ?? []).map((candidate) =>
                            candidate.id === entryId
                                ? {
                                      ...candidate,
                                      status: 'failed' as const,
                                  }
                                : candidate,
                        ),
                    }));
                    toast.error(
                        result.error || 'Gagal mengirim ulang entri',
                    );
                    return;
                }

                const savedEntry: OpnameEntryView = {
                    id: result.data.id,
                    quantity: result.data.quantity,
                    label: result.data.label ?? null,
                    status: 'saved',
                };
                setEntriesByItem((prev) => ({
                    ...prev,
                    [itemId]: replaceOptimisticEntry(
                        prev[itemId] ?? [],
                        entryId,
                        savedEntry,
                    ),
                }));
                setCounts((prev) => ({
                    ...prev,
                    [itemId]: String(result.data.countedQuantity),
                }));
            } catch {
                setEntriesByItem((prev) => ({
                    ...prev,
                    [itemId]: (prev[itemId] ?? []).map((candidate) =>
                        candidate.id === entryId
                            ? { ...candidate, status: 'failed' as const }
                            : candidate,
                    ),
                }));
                toast.error('Gagal mengirim ulang entri');
            }
        },
        [entriesByItem],
    );

    const handleRemoveEntry = useCallback(
        async (itemId: string, entryId: string) => {
            const entry = (entriesByItem[itemId] ?? []).find(
                (candidate) => candidate.id === entryId,
            );
            if (!entry) {
                return;
            }

            if (entry.status === 'pending') {
                toast.error('Entri sedang dikirim, tunggu sebentar');
                return;
            }

            if (entry.status === 'failed') {
                setEntriesByItem((prev) => ({
                    ...prev,
                    [itemId]: (prev[itemId] ?? []).filter(
                        (candidate) => candidate.id !== entryId,
                    ),
                }));
                return;
            }

            try {
                const result = await deleteOpnameEntry(entryId);
                if (!result.success) {
                    toast.error(result.error || 'Gagal menghapus entri');
                    return;
                }

                setEntriesByItem((prev) => ({
                    ...prev,
                    [itemId]: (prev[itemId] ?? []).filter(
                        (candidate) => candidate.id !== entryId,
                    ),
                }));
                setCounts((prev) => ({
                    ...prev,
                    [itemId]:
                        result.data.countedQuantity !== null
                            ? String(result.data.countedQuantity)
                            : '',
                }));
            } catch {
                toast.error('Gagal menghapus entri');
            }
        },
        [entriesByItem],
    );

    const getVariance = (item: OpnameItem) => {
        const entries = entriesByItem[item.id] ?? [];
        if (entries.length > 0) {
            return (
                entries.reduce(
                    (total, entry) => total + entry.quantity,
                    0,
                ) - item.systemQuantity
            );
        }

        const countVal = counts[item.id];
        if (countVal === undefined || countVal === '') return null;
        const actual = parseFloat(countVal);
        if (!Number.isFinite(actual)) return null;
        return actual - item.systemQuantity;
    };

    const getVarianceColor = (variance: number) => {
        if (variance > 0) return 'text-emerald-600';
        if (variance < 0) return 'text-red-600';
        return 'text-muted-foreground';
    };

    return (
        <div className="p-4 space-y-4 pb-36">
            {/* Header */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Link
                    href="/warehouse/mobile/opname"
                    className="hover:text-foreground transition-colors flex items-center gap-1"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Kembali
                </Link>
                <span>/</span>
                <span className="text-foreground font-medium truncate">
                    {session.opnameNumber || 'Sesi'}
                </span>
            </div>

            {/* Session Info */}
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                        <Badge
                            variant={isOpen ? 'secondary' : 'outline'}
                            className={
                                isOpen
                                    ? 'bg-primary/10 text-primary border-transparent'
                                    : 'border-emerald-500/30 text-emerald-600'
                            }
                        >
                            {isOpen ? 'OPEN' : 'COMPLETED'}
                        </Badge>
                    </div>
                    <h2 className="text-lg font-bold truncate">
                        {session.opnameNumber}
                    </h2>
                    <div className="flex items-center gap-1 mt-0.5">
                        <Warehouse className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                            {session.location?.name || '—'}
                        </span>
                    </div>
                </div>
                <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                >
                    <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                </Button>
            </div>

            {/* Progress */}
            <div className="p-3 border rounded-xl bg-card">
                <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-muted-foreground">Progres Hitung</span>
                    <span className="font-medium">
                        {stats.counted}/{stats.total} item
                    </span>
                </div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{
                            width: `${stats.total > 0 ? (stats.counted / stats.total) * 100 : 0}%`,
                        }}
                    />
                </div>
            </div>

            {/* Blind Mode Toggle */}
            {isOpen && (
                <div className="flex items-center justify-between p-3 border rounded-xl bg-card">
                    <div className="flex items-center gap-2">
                        {blindMode ? (
                            <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                            <Eye className="h-4 w-4 text-primary" />
                        )}
                        <div>
                            <Label className="text-sm font-medium">Blind Mode</Label>
                            <p className="text-[10px] text-muted-foreground">
                                Sembunyikan jumlah sistem
                            </p>
                        </div>
                    </div>
                    <Switch
                        checked={blindMode}
                        onCheckedChange={setBlindMode}
                    />
                </div>
            )}

            {/* Search & Filter */}
            <div className="space-y-2">
                <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Cari SKU, nama barang..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 h-10 text-sm"
                    />
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                    <Button
                        variant={itemFilter === 'ALL' ? 'default' : 'outline'}
                        size="sm"
                        className="h-7 text-xs px-2.5"
                        onClick={() => setItemFilter('ALL')}
                    >
                        Semua ({stats.total})
                    </Button>
                    <Button
                        variant={itemFilter === 'UNCOUNTED' ? 'default' : 'outline'}
                        size="sm"
                        className="h-7 text-xs px-2.5"
                        onClick={() => setItemFilter('UNCOUNTED')}
                    >
                        Belum ({stats.uncounted})
                    </Button>
                    <Button
                        variant={itemFilter === 'COUNTED' ? 'default' : 'outline'}
                        size="sm"
                        className="h-7 text-xs px-2.5"
                        onClick={() => setItemFilter('COUNTED')}
                    >
                        Sudah ({stats.counted})
                    </Button>
                </div>
            </div>

            {/* Add Item Button */}
            {isOpen && (
                <Button
                    variant="outline"
                    className="w-full h-11 border-dashed"
                    onClick={() => setAddDialogOpen(true)}
                >
                    <Plus className="h-4 w-4 mr-2" />
                    Tambah Item
                </Button>
            )}

            {/* Variance Summary (shown when not blind and has counted items) */}
            {!blindMode && stats.counted > 0 && !isOpen && (
                <button
                    onClick={() => setShowVarianceSummary(!showVarianceSummary)}
                    className="w-full p-3 border rounded-xl bg-card text-left active:scale-[0.98] transition-all"
                >
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-amber-600" />
                            <span className="text-sm font-medium">Ringkasan Selisih</span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                            {showVarianceSummary ? 'Tutup' : 'Lihat'}
                        </span>
                    </div>
                    {showVarianceSummary && (
                        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                            <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/20">
                                <p className="text-lg font-bold text-emerald-600">{stats.matched}</p>
                                <p className="text-[10px] text-muted-foreground">Matched</p>
                            </div>
                            <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/20">
                                <p className="text-lg font-bold text-blue-600">{stats.surplus}</p>
                                <p className="text-[10px] text-muted-foreground">Surplus</p>
                            </div>
                            <div className="p-2 rounded-lg bg-red-50 dark:bg-red-950/20">
                                <p className="text-lg font-bold text-red-600">{stats.shortage}</p>
                                <p className="text-[10px] text-muted-foreground">Shortage</p>
                            </div>
                        </div>
                    )}
                </button>
            )}

            {/* Items */}
            <div className="space-y-2">
                {filteredItems.length === 0 ? (
                    <div className="text-center py-12">
                        <ClipboardList className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                        <p className="text-sm text-muted-foreground">
                            {search ? 'Tidak ada item yang cocok' : 'Tidak ada item'}
                        </p>
                    </div>
                ) : (
                    filteredItems.map((item) => {
                        const itemEntries = entriesByItem[item.id] ?? [];
                        const hasEntries = itemEntries.length > 0;
                        const entryTotal = itemEntries.reduce(
                            (total, entry) => total + entry.quantity,
                            0,
                        );
                        const variance = getVariance(item);
                        const isCounted =
                            counts[item.id] !== undefined &&
                            counts[item.id] !== '';
                        const actualDisplay = hasEntries
                            ? formatQuantity(entryTotal)
                            : isCounted
                              ? formatQuantity(
                                    parseFloat(counts[item.id] || '0'),
                                )
                              : '—';
                        const isDirty = dirtyItems.includes(item.id);

                        return (
                            <div
                                key={item.id}
                                className={`p-3 border rounded-xl bg-card transition-all ${
                                    isDirty ? 'border-primary/50 bg-primary/5' : ''
                                }`}
                            >
                                {/* Item Header */}
                                <div className="flex items-start justify-between gap-2 mb-2">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium truncate">
                                            {item.productVariant.name}
                                        </p>
                                        <p className="text-[10px] text-muted-foreground truncate">
                                            {item.productVariant.product.name} &middot;{' '}
                                            {item.productVariant.skuCode} &middot;{' '}
                                            {item.productVariant.primaryUnit}
                                        </p>
                                    </div>
                                    {isCounted && (
                                        <Badge
                                            variant="secondary"
                                            className="bg-primary/10 text-primary border-transparent text-[10px] shrink-0"
                                        >
                                            Hitung
                                        </Badge>
                                    )}
                                </div>

                                {/* System Qty (hidden in blind mode) */}
                                {!blindMode && (
                                    <p className="text-xs text-muted-foreground mb-2">
                                        Sistem: {formatQuantity(item.systemQuantity)}
                                    </p>
                                )}

                                {/* Actual Qty + Entry details */}
                                {isOpen ? (
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2">
                                            <Label className="text-xs text-muted-foreground w-16 shrink-0">
                                                Aktual
                                            </Label>
                                            {hasEntries ? (
                                                <div className="h-9 text-sm flex-1 flex items-center">
                                                    <span className="font-medium">
                                                        {formatQuantity(entryTotal)}
                                                    </span>
                                                    <span className="ml-2 text-[10px] text-muted-foreground">
                                                        dari rincian
                                                    </span>
                                                </div>
                                            ) : (
                                                <Input
                                                    type="number"
                                                    inputMode="decimal"
                                                    value={counts[item.id] ?? ''}
                                                    onChange={(e) =>
                                                        handleCountChange(
                                                            item.id,
                                                            e.target.value,
                                                        )
                                                    }
                                                    placeholder="0"
                                                    className="h-9 text-sm flex-1"
                                                    min="0"
                                                    step="any"
                                                />
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Label className="text-xs text-muted-foreground w-16 shrink-0">
                                                Catatan
                                            </Label>
                                            <Input
                                                value={notes[item.id] ?? ''}
                                                onChange={(e) =>
                                                    handleNoteChange(
                                                        item.id,
                                                        e.target.value,
                                                    )
                                                }
                                                placeholder="Opsional"
                                                className="h-9 text-sm flex-1"
                                                maxLength={500}
                                            />
                                        </div>

                                    </div>
                                ) : (
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-muted-foreground">
                                            Aktual: {actualDisplay}
                                        </span>
                                        {variance !== null && (
                                            <span
                                                className={`font-medium ${getVarianceColor(variance)}`}
                                            >
                                                {variance > 0 ? '+' : ''}
                                                {formatQuantity(variance)}
                                            </span>
                                        )}
                                    </div>
                                )}

                                {(isOpen || hasEntries) && (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setExpandedItems((prev) => ({
                                                ...prev,
                                                [item.id]: !prev[item.id],
                                            }))
                                        }
                                        className="mt-2 flex min-h-9 items-center gap-1 text-xs font-medium text-primary"
                                    >
                                        {expandedItems[item.id]
                                            ? 'Tutup rincian'
                                            : 'Rincian'}
                                        {hasEntries && (
                                            <span className="font-normal text-muted-foreground">
                                                ({itemEntries.length} entri)
                                            </span>
                                        )}
                                    </button>
                                )}

                                {expandedItems[item.id] &&
                                    (isOpen || hasEntries) && (
                                        <div className="mt-2">
                                            <OpnameEntryEditor
                                                entries={itemEntries}
                                                unit={
                                                    item.productVariant
                                                        .primaryUnit
                                                }
                                                readOnly={!isOpen}
                                                onAdd={(quantity, label) =>
                                                    handleAddEntry(
                                                        item.id,
                                                        quantity,
                                                        label,
                                                    )
                                                }
                                                onRemove={(entryId) =>
                                                    handleRemoveEntry(
                                                        item.id,
                                                        entryId,
                                                    )
                                                }
                                                onRetry={(entryId) =>
                                                    handleRetryEntry(
                                                        item.id,
                                                        entryId,
                                                    )
                                                }
                                            />
                                        </div>
                                    )}
                            </div>
                        );
                    })
                )}
            </div>

            {/* Bukti Opname — optional */}
            <WarehouseAttachmentPanel
                entityId={session.id}
                entityLabel={session.opnameNumber || 'Opname'}
                entityType="stockOpnameId"
                checkpoint="OPNAME"
                attachments={safeAttachments.filter((a) => a.checkpoint === 'OPNAME')}
                disabled={isSaving || isFinalizing}
                onAttachmentChange={() => router.refresh()}
            />

            {/* Add Item Dialog */}
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
                <DialogContent className="max-w-[95vw] p-4">
                    <DialogHeader>
                        <DialogTitle>Tambah Item ke Opname</DialogTitle>
                        <DialogDescription>
                            Cari barang yang ada fisik tapi belum tercatat di
                            sistem. Item ditambahkan dengan jumlah sistem 0.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Cari nama, SKU, atau produk..."
                                className="pl-9 h-11"
                                value={productSearch}
                                onChange={(e) => setProductSearch(e.target.value)}
                                autoFocus
                            />
                        </div>
                        <div className="max-h-[55vh] overflow-y-auto border rounded-lg divide-y">
                            {allVariants.length === 0 ? (
                                <div className="p-8 text-center text-muted-foreground text-sm">
                                    <div className="flex items-center justify-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Memuat produk...
                                    </div>
                                </div>
                            ) : filteredVariants.length === 0 ? (
                                <div className="p-8 text-center text-muted-foreground text-sm">
                                    Produk tidak ditemukan
                                </div>
                            ) : (
                                filteredVariants.map((variant) => (
                                    <button
                                        type="button"
                                        key={variant.id}
                                        className="w-full p-3 active:bg-muted cursor-pointer flex items-center justify-between text-left transition-colors min-h-14 disabled:pointer-events-none disabled:opacity-50"
                                        onClick={() => handleAddItem(variant.id)}
                                        disabled={isAddingItem}
                                    >
                                        <div className="flex flex-col min-w-0">
                                            <span className="font-medium text-sm truncate">
                                                {variant.name}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                {variant.product.name} &middot;{' '}
                                                {variant.skuCode}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0 ml-4">
                                            <Badge
                                                variant="outline"
                                                className="text-xs"
                                            >
                                                {variant.primaryUnit}
                                            </Badge>
                                            {isAddingItem ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <Plus className="h-4 w-4 text-muted-foreground" />
                                            )}
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Sticky Actions */}
            {isOpen && (
                <div className="fixed bottom-16 left-0 right-0 z-40 bg-background border-t p-3 pb-[env(safe-area-inset-bottom)]">
                    <div className="flex gap-2">
                        <Button
                            onClick={handleSave}
                            disabled={isSaving || !hasChanges}
                            variant="outline"
                            className="flex-1 h-11"
                        >
                            {isSaving ? (
                                <span className="h-4 w-4 border-2 border-background/30 border-t-background rounded-full animate-spin mr-2" />
                            ) : (
                                <Save className="h-4 w-4 mr-2" />
                            )}
                            Simpan
                        </Button>
                        <Button
                            onClick={handleFinalize}
                            disabled={isFinalizing}
                            className="flex-1 h-11"
                        >
                            {isFinalizing ? (
                                <span className="h-4 w-4 border-2 border-background/30 border-t-background rounded-full animate-spin mr-2" />
                            ) : (
                                <CheckCircle className="h-4 w-4 mr-2" />
                            )}
                            Selesai
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
