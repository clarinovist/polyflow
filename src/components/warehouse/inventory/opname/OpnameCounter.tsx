'use client';

import { Fragment, useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
    Eye,
    EyeOff,
    Save,
    Loader2,
    ChevronRight,
    ChevronDown,
    RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import {
    markOpnameItemUncounted,
    saveOpnameCount,
} from '@/actions/inventory/opname';
import { formatQuantity } from '@/lib/utils/utils';
import { warehouseComponentLabels } from '@/lib/labels';
import { OpnameEntryEditor } from '@/components/warehouse/inventory/opname/OpnameEntryEditor';
import { useOpnameAutosave } from '@/hooks/useOpnameAutosave';
import { describeServerActionFailure } from '@/lib/utils/server-action-errors';

const NOOP_ENTRY_ACTION = () => undefined;

interface OpnameItem {
    id: string;
    countedQuantity: number | null;
    systemQuantity: number;
    notes: string | null;
    productVariant: {
        name: string;
        skuCode: string;
        primaryUnit: string;
        product: {
            name: string;
        };
    };
    entries?: Array<{
        id: string;
        quantity: number;
        label?: string | null;
        createdAt: Date | string;
    }>;
}

interface OpnameSession {
    id: string;
    items: OpnameItem[];
}

interface OpnameCounterProps {
    session: OpnameSession;
    isReadOnly: boolean;
}

export function OpnameCounter({ session, isReadOnly }: OpnameCounterProps) {
    const router = useRouter();
    const [counts, setCounts] = useState<Record<string, string>>({});
    const [notes, setNotes] = useState<Record<string, string>>({});
    const [blindMode, setBlindMode] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [resettingItemId, setResettingItemId] = useState<string | null>(null);
    const [locallyResetItemIds, setLocallyResetItemIds] = useState<Set<string>>(
        new Set(),
    );
    const [expandedItems, setExpandedItems] = useState<
        Record<string, boolean>
    >({});

    // Initialize state from props
    useEffect(() => {
        const initialCounts: Record<string, string> = {};
        const initialNotes: Record<string, string> = {};

        (session.items || []).forEach((item) => {
            if (item.countedQuantity !== null) {
                initialCounts[item.id] = item.countedQuantity.toString();
            }
            if (item.notes) {
                initialNotes[item.id] = item.notes;
            }
        });

        setCounts(initialCounts);
        setNotes(initialNotes);
        setLocallyResetItemIds(new Set());
    }, [session]);

    const handleCountChange = (id: string, value: string) => {
        setCounts((prev) => ({ ...prev, [id]: value }));
        if (value !== '') {
            setLocallyResetItemIds((prev) => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }
    };

    const handleNoteChange = (id: string, value: string) => {
        setNotes((prev) => ({ ...prev, [id]: value }));
    };

    const toggleEntryExpansion = (itemId: string) => {
        setExpandedItems((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
    };

    const handleMarkUncounted = async (itemId: string) => {
        autosaveCancel();
        setResettingItemId(itemId);
        try {
            const result = await markOpnameItemUncounted(session.id, itemId);
            if (!result.success) {
                toast.error(`Gagal: ${result.error}`);
                return;
            }
            setCounts((prev) => {
                const next = { ...prev };
                delete next[itemId];
                return next;
            });
            setLocallyResetItemIds((prev) => new Set(prev).add(itemId));
            toast.success('Item ditandai belum dihitung');
            router.refresh();
        } catch {
            toast.error('Gagal menandai item belum dihitung');
        } finally {
            setResettingItemId(null);
        }
    };

    const dirtyItems = useMemo(() => {
        const dirty: string[] = [];
        for (const item of session.items || []) {
            const hasEntries = (item.entries ?? []).length > 0;
            const currentNote = notes[item.id] || '';
            const originalNote = item.notes || '';
            if (hasEntries) {
                if (currentNote !== originalNote) dirty.push(item.id);
                continue;
            }

            const currentCount = counts[item.id] ?? '';
            const originalCount = locallyResetItemIds.has(item.id)
                ? ''
                : item.countedQuantity !== null
                  ? item.countedQuantity.toString()
                  : '';
            if (
                currentCount !== originalCount ||
                currentNote !== originalNote
            ) {
                dirty.push(item.id);
            }
        }
        return dirty;
    }, [session.items, counts, notes, locallyResetItemIds]);
    const saveableDirtyItems = useMemo(
        () =>
            dirtyItems.filter((id) => {
                const item = session.items.find(
                    (candidate) => candidate.id === id,
                );
                return (
                    (item?.entries ?? []).length > 0 ||
                    (counts[id] !== undefined && counts[id] !== '')
                );
            }),
        [dirtyItems, session.items, counts],
    );
    const hasChanges = saveableDirtyItems.length > 0;

    // Never translate a temporarily cleared input into a physical count of 0.
    // Resetting to uncounted uses the explicit audited action instead.
    const autosaveDirtyPayload = useMemo(() => {
        if (saveableDirtyItems.length === 0) return null;
        return saveableDirtyItems.map((id) => ({
            id,
            countedQuantity: parseFloat(counts[id] || '0'),
            notes: notes[id],
        }));
    }, [saveableDirtyItems, counts, notes]);

    const autosaveSaveFn = useCallback(
        async (payload: { id: string; countedQuantity: number; notes: string }[]) => {
            const result = await saveOpnameCount(session.id, payload);
            if (!result.success) {
                throw new Error(result.error || 'Autosave gagal');
            }
            router.refresh();
        },
        [session.id, router],
    );

    const {
        status: autosaveStatus,
        lastSavedAt,
        flush: autosaveFlush,
        cancel: autosaveCancel,
    } = useOpnameAutosave(autosaveDirtyPayload as NonNullable<typeof autosaveDirtyPayload>, autosaveSaveFn, {
            enabled: !isReadOnly,
            delayMs: 2500,
        });

    const handleSave = async () => {
        setIsSaving(true);
        try {
            // Convert state to array for server action
            const updates = saveableDirtyItems.map((id) => ({
                id,
                countedQuantity: parseFloat(counts[id] || '0'),
                notes: notes[id],
            }));

            const result = await saveOpnameCount(session.id, updates);

            if (result.success) {
                toast.success('Jumlah perhitungan berhasil disimpan');
                router.refresh();
            } else {
                toast.error(`Gagal: ${result.error}`);
            }
        } catch (err) {
            const failure = describeServerActionFailure(
                err,
                err instanceof Error ? err.message : String(err),
            );
            toast.error(
                failure.isStaleDeploy
                    ? failure.message
                    : `Gagal menyimpan: ${failure.message}`,
                {
                    duration: failure.isStaleDeploy ? 10000 : undefined,
                    action: failure.isStaleDeploy
                        ? {
                              label: 'Refresh',
                              onClick: () => window.location.reload(),
                          }
                        : undefined,
                },
            );
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-4 relative">
            <div className="flex items-center justify-between bg-muted/40 p-4 rounded-lg border border-border/50">
                <div className="flex items-center space-x-3">
                    <Switch
                        id="blind-mode"
                        checked={blindMode}
                        onCheckedChange={setBlindMode}
                    />
                    <Label
                        htmlFor="blind-mode"
                        className="flex items-center gap-2 cursor-pointer select-none"
                    >
                        {blindMode ? (
                            <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                            <Eye className="h-4 w-4 text-primary" />
                        )}
                        <div className="flex flex-col">
                            <span className="font-medium">Mode Buta</span>
                            <span className="text-xs text-muted-foreground font-normal">
                                Sembunyikan jumlah sistem agar hitung fisik tidak bias
                            </span>
                        </div>
                    </Label>
                </div>
            </div>

            <p className="text-xs text-muted-foreground md:hidden">
                Geser tabel ke samping untuk melihat seluruh kolom.
            </p>
            <div
                className="overflow-x-auto rounded-lg border border-border/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_[data-slot=table-container]]:overflow-visible"
                role="region"
                aria-label="Perhitungan fisik stock opname"
                tabIndex={0}
            >
                <Table className="min-w-[820px]">
                    <TableHeader className="bg-muted/30">
                        <TableRow className="hover:bg-transparent">
                            <TableHead className="w-[300px]">Produk</TableHead>
                            <TableHead>SKU</TableHead>
                            <TableHead>Satuan</TableHead>
                            <TableHead className="text-right">
                                {warehouseComponentLabels.expectedQty}
                            </TableHead>
                            <TableHead className="w-[180px] text-right">
                                {warehouseComponentLabels.actualQty}
                            </TableHead>
                            <TableHead className="w-[200px]">Catatan</TableHead>
                            <TableHead className="w-[80px]">Rincian</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {(session.items || []).map((item) => {
                            const itemEntries = item.entries ?? [];
                            const hasEntries = itemEntries.length > 0;
                            const isExpanded = expandedItems[item.id] ?? false;

                            return (
                                <Fragment key={item.id}>
                                    <TableRow className="hover:bg-muted/20">
                                        <TableCell className="font-medium">
                                            <div className="flex flex-col">
                                                <span>{item.productVariant.name}</span>
                                                <span className="text-xs text-muted-foreground font-normal">
                                                    {item.productVariant.product.name}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-xs font-mono">
                                            {item.productVariant.skuCode}
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            {item.productVariant.primaryUnit}
                                        </TableCell>
                                        <TableCell className="text-right text-muted-foreground font-mono">
                                            {blindMode ? (
                                                <span className="opacity-20 select-none">
                                                    ••••
                                                </span>
                                            ) : (
                                                formatQuantity(
                                                    Number(item.systemQuantity),
                                                )
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex flex-col items-end gap-1">
                                                <Input
                                                    type="number"
                                                    step="any"
                                                    className="text-right h-9 font-mono"
                                                    placeholder="Belum dihitung"
                                                    value={counts[item.id] || ''}
                                                    onChange={(e) =>
                                                        handleCountChange(
                                                            item.id,
                                                            e.target.value,
                                                        )
                                                    }
                                                    onBlur={() =>
                                                        autosaveFlush()
                                                    }
                                                    disabled={
                                                        isReadOnly ||
                                                        hasEntries ||
                                                        resettingItemId === item.id
                                                    }
                                                />
                                                {!isReadOnly &&
                                                    !hasEntries &&
                                                    item.countedQuantity !== null &&
                                                    !locallyResetItemIds.has(item.id) && (
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-7 px-2 text-xs text-muted-foreground"
                                                            onClick={() =>
                                                                handleMarkUncounted(
                                                                    item.id,
                                                                )
                                                            }
                                                            disabled={
                                                                resettingItemId ===
                                                                item.id
                                                            }
                                                        >
                                                            {resettingItemId ===
                                                            item.id ? (
                                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                            ) : (
                                                                <RotateCcw className="h-3.5 w-3.5" />
                                                            )}
                                                            Tandai belum dihitung
                                                        </Button>
                                                    )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Input
                                                placeholder={
                                                    warehouseComponentLabels.optional
                                                }
                                                className="h-9 text-xs"
                                                value={notes[item.id] || ''}
                                                onChange={(e) =>
                                                    handleNoteChange(
                                                        item.id,
                                                        e.target.value,
                                                    )
                                                }
                                                onBlur={() =>
                                                    autosaveFlush()
                                                }
                                                disabled={isReadOnly}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            {hasEntries ? (
                                                <button
                                                    type="button"
                                                    onClick={() => toggleEntryExpansion(item.id)}
                                                    className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium"
                                                >
                                                    {isExpanded ? (
                                                        <ChevronDown className="h-3.5 w-3.5" />
                                                    ) : (
                                                        <ChevronRight className="h-3.5 w-3.5" />
                                                    )}
                                                    {itemEntries.length} entri
                                                </button>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">—</span>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                    {isExpanded && hasEntries && (
                                        <TableRow>
                                            <TableCell colSpan={7} className="bg-muted/10 px-6 py-4">
                                                <OpnameEntryEditor
                                                    entries={itemEntries.map((e) => ({
                                                        id: e.id,
                                                        quantity: e.quantity,
                                                        label: e.label,
                                                        status: 'saved' as const,
                                                    }))}
                                                    unit={item.productVariant.primaryUnit}
                                                    readOnly
                                                    onAdd={NOOP_ENTRY_ACTION}
                                                    onRemove={NOOP_ENTRY_ACTION}
                                                    onRetry={NOOP_ENTRY_ACTION}
                                                />
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </Fragment>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>

            {/* Autosave status indicator */}
            {!isReadOnly &&
                (autosaveStatus === 'saving' ||
                    autosaveStatus === 'saved' ||
                    autosaveStatus === 'error') && (
                    <div className="text-center py-1">
                        {autosaveStatus === 'saving' && (
                            <span className="text-[10px] text-muted-foreground">
                                Menyimpan…
                            </span>
                        )}
                        {autosaveStatus === 'saved' && lastSavedAt && (
                            <span className="text-[10px] text-muted-foreground">
                                Tersimpan otomatis ·{' '}
                                {lastSavedAt.toLocaleTimeString('id-ID', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                })}
                            </span>
                        )}
                        {autosaveStatus === 'error' && (
                            <button
                                type="button"
                                onClick={() => autosaveFlush()}
                                className="text-[10px] text-red-600 underline"
                            >
                                Gagal menyimpan otomatis, tekan untuk mencoba lagi
                            </button>
                        )}
                    </div>
                )}

            {/* Sticky Save Action */}
            {!isReadOnly && (
                <div
                    className={`sticky bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-md border-t border-border mt-6 flex justify-end transition-all ${hasChanges ? 'opacity-100 translate-y-0' : 'opacity-50 translate-y-10 pointer-events-none'}`}
                >
                    <Button
                        onClick={handleSave}
                        disabled={!hasChanges || isSaving}
                        className="shadow-lg shadow-primary/20"
                    >
                        {isSaving ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <Save className="mr-2 h-4 w-4" />
                        )}
                        {isSaving
                            ? `${warehouseComponentLabels.saveCount}...`
                            : warehouseComponentLabels.saveCount}
                    </Button>
                </div>
            )}
        </div>
    );
}
