'use client';

import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
    Calendar,
    Search,
    MapPin,
    Users,
    Route,
    Check,
    ChevronUp,
    ChevronDown,
    Trash2,
    Upload,
    Copy,
    Wand2,
} from 'lucide-react';
import {
    createRoutePlan,
    publishRoutePlan,
    deleteRoutePlan,
    copyLastWeekRoute,
    copyRouteFromDate,
    importRouteExcel,
    optimizeRouteNearestNeighbor,
    listRecentRouteDates,
} from '@/actions/sales/route-plans';
import { RouteStatsBar } from './RouteStatsBar';
import { toast } from 'sonner';
import type { RouteMapCustomer } from './RouteMapPreview';

const DynamicRouteMapPreview = dynamic(
    () =>
        import('./RouteMapPreview').then(
            (module) => module.RouteMapPreview,
        ),
    {
        ssr: false,
        loading: () => (
            <div className="flex items-center justify-center bg-muted/30 rounded-lg border h-[400px]">
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <MapPin className="h-8 w-8 animate-pulse" />
                    <p className="text-xs">Memuat peta...</p>
                </div>
            </div>
        ),
    },
);

type Customer = {
    id: string;
    name: string;
    code: string | null;
    city: string | null;
    latitude?: number | null;
    longitude?: number | null;
};

type RoutePlanItem = {
    id: string;
    customerId: string;
    sortOrder: number;
    status: string;
    customer: Customer;
};

type RoutePlan = {
    id: string;
    date: string;
    userId: string;
    status: string;
    items: RoutePlanItem[];
    user: { id: string; name: string | null };
};

type Rep = {
    id: string;
    name: string | null;
};

type RoutePlannerBoardProps = {
    plans: RoutePlan[];
    customers: Customer[];
};

export function RoutePlannerBoard({
    plans,
    customers,
}: RoutePlannerBoardProps) {
    const today = new Date().toISOString().split('T')[0];
    const [selectedDate, setSelectedDate] = useState(today);
    const [selectedRepId, setSelectedRepId] = useState<string>('');
    const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>(
        [],
    );
    const [search, setSearch] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [recentDates, setRecentDates] = useState<
        { date: string | Date; userId: string; userName: string; itemCount: number }[]
    >([]);
    const [showTemplatePicker, setShowTemplatePicker] = useState(false);

    // Collect unique reps from existing plans
    const reps: Rep[] = useMemo(() => {
        const map = new Map<string, Rep>();
        for (const plan of plans) {
            if (!map.has(plan.userId)) {
                map.set(plan.userId, {
                    id: plan.userId,
                    name: plan.user.name ?? 'Unknown',
                });
            }
        }
        return Array.from(map.values());
    }, [plans]);

    // Derived customers for map (ordered by selectedCustomerIds)
    const selectedCustomersForMap: RouteMapCustomer[] = useMemo(() => {
        return selectedCustomerIds
            .map((id, idx) => {
                const c = customers.find((cu) => cu.id === id);
                if (!c) return null;
                return {
                    id: c.id,
                    name: c.name,
                    code: c.code,
                    city: c.city,
                    latitude: c.latitude ?? null,
                    longitude: c.longitude ?? null,
                    sortOrder: idx + 1,
                };
            })
            .filter((c): c is RouteMapCustomer => c !== null);
    }, [selectedCustomerIds, customers]);

    // Existing plan for selected date + rep
    const existingPlan = useMemo(
        () =>
            plans.find(
                (p) => p.date === selectedDate && p.userId === selectedRepId,
            ),
        [plans, selectedDate, selectedRepId],
    );

    // Filtered customers
    const filteredCustomers = useMemo(() => {
        if (!search) return customers;
        const q = search.toLowerCase();
        return customers.filter(
            (c) =>
                c.name.toLowerCase().includes(q) ||
                c.code?.toLowerCase().includes(q) ||
                c.city?.toLowerCase().includes(q),
        );
    }, [customers, search]);

    // Toggle customer selection
    const toggleCustomer = (id: string) => {
        setSelectedCustomerIds((prev) =>
            prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
        );
    };

    // Move customer up/down in order
    const moveCustomer = (id: string, direction: 'up' | 'down') => {
        setSelectedCustomerIds((prev) => {
            const idx = prev.indexOf(id);
            if (idx < 0) return prev;
            const newIdx = direction === 'up' ? idx - 1 : idx + 1;
            if (newIdx < 0 || newIdx >= prev.length) return prev;
            const next = [...prev];
            [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
            return next;
        });
    };

    // Remove customer from selection
    const removeCustomer = (id: string) => {
        setSelectedCustomerIds((prev) => prev.filter((c) => c !== id));
    };

    // Save route plan
    const handleSave = async () => {
        if (!selectedRepId) {
            toast.error('Pilih sales rep terlebih dahulu');
            return;
        }
        if (selectedCustomerIds.length === 0) {
            toast.error('Pilih minimal 1 customer');
            return;
        }

        setIsSaving(true);
        try {
            const result = await createRoutePlan({
                date: selectedDate,
                userId: selectedRepId,
                items: selectedCustomerIds.map((customerId, idx) => ({
                    customerId,
                    sortOrder: idx + 1,
                })),
            });

            if (result?.success) {
                toast.success(
                    `Rute berhasil disimpan: ${selectedCustomerIds.length} toko`,
                );
            } else {
                toast.error(
                    (result as { error?: string })?.error ||
                        'Gagal menyimpan rute',
                );
            }
        } catch {
            toast.error('Gagal menyimpan rute');
        } finally {
            setIsSaving(false);
        }
    };

    // Publish route plan
    const handlePublish = async () => {
        if (!existingPlan) return;

        setIsSaving(true);
        try {
            const result = await publishRoutePlan(existingPlan.id);
            if (result?.success) {
                toast.success('Rute berhasil dipublikasikan');
            } else {
                toast.error(
                    (result as { error?: string })?.error ||
                        'Gagal mempublikasikan rute',
                );
            }
        } catch {
            toast.error('Gagal mempublikasikan rute');
        } finally {
            setIsSaving(false);
        }
    };

    // Delete route plan
    const handleDelete = async () => {
        if (!existingPlan) return;
        if (!confirm('Hapus rute ini?')) return;

        setIsSaving(true);
        try {
            const result = await deleteRoutePlan(existingPlan.id);
            if (result?.success) {
                toast.success('Rute berhasil dihapus');
                setSelectedCustomerIds([]);
            } else {
                toast.error(
                    (result as { error?: string })?.error ||
                        'Gagal menghapus rute',
                );
            }
        } catch {
            toast.error('Gagal menghapus rute');
        } finally {
            setIsSaving(false);
        }
    };

    // Load existing plan items into selection
    const loadExistingPlan = () => {
        if (existingPlan) {
            setSelectedCustomerIds(
                existingPlan.items
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((item) => item.customerId),
            );
        }
    };

    // Copy last week
    const handleCopyLastWeek = async () => {
        if (!selectedRepId) {
            toast.error('Pilih sales rep terlebih dahulu');
            return;
        }
        setIsSaving(true);
        try {
            const result = await copyLastWeekRoute(selectedDate, selectedRepId);
            if (result?.success) {
                const data = (result as { data?: { items?: { customerId: string; sortOrder: number }[] } }).data;
                const orderedIds = (data?.items ?? [])
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((i) => i.customerId);
                if (orderedIds.length > 0) {
                    setSelectedCustomerIds(orderedIds);
                }
                toast.success(
                    `Berhasil menyalin ${orderedIds.length} toko dari minggu lalu`,
                );
            } else {
                toast.error(
                    (result as { error?: string })?.error ||
                        'Gagal menyalin rute',
                );
            }
        } catch {
            toast.error('Gagal menyalin rute minggu lalu');
        } finally {
            setIsSaving(false);
        }
    };

    // Import Excel
    const handleImportExcel = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.xlsx,.xls,.csv';
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;

            try {
                const XLSX = await import('xlsx');
                const data = await file.arrayBuffer();
                const workbook = XLSX.read(data);
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows =
                    XLSX.utils.sheet_to_json<Record<string, string>>(sheet);

                const codes: string[] = [];
                for (const row of rows) {
                    const code =
                        row['code'] ||
                        row['kode'] ||
                        row['customer_code'] ||
                        row['Kode Customer'] ||
                        row['kode_customer'];
                    if (code) codes.push(String(code).trim());
                }

                if (codes.length === 0) {
                    toast.error(
                        'Tidak ada kode customer ditemukan di file. Kolom: code/kode/customer_code',
                    );
                    return;
                }

                if (!selectedRepId) {
                    toast.error('Pilih sales rep terlebih dahulu');
                    return;
                }

                setIsSaving(true);
                const result = await importRouteExcel({
                    date: selectedDate,
                    userId: selectedRepId,
                    customerCodes: codes,
                });

                if (result?.success) {
                    const planData = (result as { data?: { items?: { customerId: string; sortOrder: number }[] } }).data;
                    const orderedIds = (planData?.items ?? [])
                        .sort((a, b) => a.sortOrder - b.sortOrder)
                        .map((i) => i.customerId);
                    if (orderedIds.length > 0) {
                        setSelectedCustomerIds(orderedIds);
                    }
                    toast.success(
                        `Import berhasil: ${orderedIds.length} toko ditemukan di database`,
                    );
                } else {
                    toast.error(
                        (result as { error?: string })?.error || 'Gagal import',
                    );
                }
            } catch {
                toast.error('Gagal membaca file Excel');
            } finally {
                setIsSaving(false);
            }
        };
        input.click();
    };

    // Optimasi rute nearest-neighbor
    const handleOptimize = async () => {
        if (!existingPlan) {
            toast.error('Simpan rute terlebih dahulu sebelum optimasi');
            return;
        }
        setIsSaving(true);
        try {
            const result = await optimizeRouteNearestNeighbor(existingPlan.id);
            if (result?.success) {
                const data = (result as { data?: { orderedCustomerIds?: string[] } }).data;
                const orderedIds = data?.orderedCustomerIds;
                if (orderedIds && orderedIds.length > 0) {
                    setSelectedCustomerIds(orderedIds);
                }
                toast.success('Rute berhasil dioptimasi (nearest-neighbor)');
            } else {
                toast.error(
                    (result as { error?: string })?.error ||
                        'Gagal optimasi rute',
                );
            }
        } catch {
            toast.error('Gagal optimasi rute');
        } finally {
            setIsSaving(false);
        }
    };

    // Select all filtered
    const selectAll = () => {
        const ids = filteredCustomers.map((c) => c.id);
        setSelectedCustomerIds((prev) => [...new Set([...prev, ...ids])]);
    };

    // Load recent route dates for template picker
    const handleLoadRecentDates = async () => {
        try {
            const result = await listRecentRouteDates(selectedRepId || undefined);
            if (result?.success && result.data) {
                setRecentDates(
                    result.data as {
                        date: string | Date;
                        userId: string;
                        userName: string;
                        itemCount: number;
                    }[],
                );
                setShowTemplatePicker(true);
            }
        } catch {
            toast.error('Gagal memuat tanggal rute');
        }
    };

    // Copy from a template date
    const handleCopyFromDate = async (fromDate: string) => {
        if (!selectedRepId) {
            toast.error('Pilih sales rep terlebih dahulu');
            return;
        }
        setIsSaving(true);
        try {
            const result = await copyRouteFromDate(
                fromDate,
                selectedDate,
                selectedRepId,
            );
            if (result?.success) {
                const data = (result as { data?: { items?: { customerId: string; sortOrder: number }[] } }).data;
                const orderedIds = (data?.items ?? [])
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((i) => i.customerId);
                if (orderedIds.length > 0) {
                    setSelectedCustomerIds(orderedIds);
                }
                toast.success(
                    `Berhasil menyalin ${orderedIds.length} toko dari tanggal ${fromDate}`,
                );
                setShowTemplatePicker(false);
            } else {
                toast.error(
                    (result as { error?: string })?.error ||
                        'Gagal menyalin rute',
                );
            }
        } catch {
            toast.error('Gagal menyalin rute dari template');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold">Rute Harian</h1>
                <p className="text-sm text-muted-foreground">
                    Atur rute kunjungan harian untuk sales rep
                </p>
            </div>

            {/* Controls */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Date Picker */}
                <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">
                        <Calendar className="inline h-3 w-3 mr-1" />
                        Tanggal
                    </label>
                    <Input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => {
                            setSelectedDate(e.target.value);
                            setSelectedCustomerIds([]);
                        }}
                        className="h-10"
                    />
                </div>

                {/* Rep Selector */}
                <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">
                        <Users className="inline h-3 w-3 mr-1" />
                        Sales Rep
                    </label>
                    <select
                        value={selectedRepId}
                        onChange={(e) => {
                            setSelectedRepId(e.target.value);
                            setSelectedCustomerIds([]);
                        }}
                        className="w-full h-10 px-3 border border-input rounded-lg bg-background text-sm"
                    >
                        <option value="">Pilih sales rep...</option>
                        {reps.map((r) => (
                            <option key={r.id} value={r.id}>
                                {r.name}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Stats */}
                <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">
                        <Route className="inline h-3 w-3 mr-1" />
                        Ringkasan
                    </label>
                    <div className="flex items-center gap-4 h-10">
                        <span className="text-sm font-semibold">
                            {selectedCustomerIds.length} toko
                        </span>
                        {existingPlan && (
                            <Badge
                                variant={
                                    existingPlan.status === 'PUBLISHED'
                                        ? 'default'
                                        : 'secondary'
                                }
                                className="text-[10px]"
                            >
                                {existingPlan.status}
                            </Badge>
                        )}
                    </div>
                </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
                <Button
                    onClick={handleSave}
                    disabled={
                        isSaving ||
                        !selectedRepId ||
                        selectedCustomerIds.length === 0
                    }
                    size="sm"
                >
                    <Check className="h-4 w-4 mr-1" />
                    {existingPlan ? 'Update Rute' : 'Simpan Rute'}
                </Button>
                {existingPlan && existingPlan.status === 'DRAFT' && (
                    <Button
                        onClick={handlePublish}
                        disabled={isSaving}
                        size="sm"
                        variant="default"
                    >
                        Publikasikan
                    </Button>
                )}
                {existingPlan && (
                    <Button
                        onClick={handleDelete}
                        disabled={isSaving}
                        size="sm"
                        variant="destructive"
                    >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Hapus
                    </Button>
                )}
                {existingPlan && (
                    <Button
                        onClick={loadExistingPlan}
                        size="sm"
                        variant="outline"
                    >
                        Muat Rute
                    </Button>
                )}
                <Button
                    onClick={handleCopyLastWeek}
                    size="sm"
                    variant="outline"
                    disabled={isSaving || !selectedRepId}
                >
                    <Copy className="h-4 w-4 mr-1" />
                    Salin Minggu Lalu
                </Button>
                <Button
                    onClick={handleLoadRecentDates}
                    size="sm"
                    variant="outline"
                    disabled={isSaving || !selectedRepId}
                >
                    <Copy className="h-4 w-4 mr-1" />
                    Gunakan Template
                </Button>
                <Button
                    onClick={handleImportExcel}
                    size="sm"
                    variant="outline"
                    disabled={isSaving}
                >
                    <Upload className="h-4 w-4 mr-1" />
                    Import Excel
                </Button>
                {existingPlan && (
                    <Button
                        onClick={handleOptimize}
                        size="sm"
                        variant="outline"
                        disabled={isSaving}
                    >
                        <Wand2 className="h-4 w-4 mr-1" />
                        Optimasi Rute
                    </Button>
                )}
                <Button onClick={selectAll} size="sm" variant="outline">
                    Pilih Semua
                </Button>
            </div>

            {/* Map Preview + Stats */}
            <RouteStatsBar
                customers={selectedCustomersForMap}
                totalCount={selectedCustomerIds.length}
            />
            <DynamicRouteMapPreview customers={selectedCustomersForMap} />

            {/* Template Picker Dropdown */}
            {showTemplatePicker && (
                <div className="border rounded-xl p-4 bg-muted/30 space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold">
                            Pilih Tanggal Sumber
                        </h3>
                        <Button
                            onClick={() => setShowTemplatePicker(false)}
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                        >
                            Tutup
                        </Button>
                    </div>
                    {recentDates.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                            Belum ada rute tersimpan
                        </p>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {recentDates.map((rd) => (
                                <button
                                    key={`${String(rd.date)}-${rd.userId}`}
                                    type="button"
                                    onClick={() =>
                                        handleCopyFromDate(String(rd.date))
                                    }
                                    disabled={isSaving}
                                    className="text-left p-3 border rounded-lg hover:bg-background active:scale-[0.98] transition-all min-h-[48px]"
                                >
                                    <p className="text-xs font-semibold">
                                        {new Date(rd.date).toLocaleDateString(
                                            'id-ID',
                                            {
                                                weekday: 'short',
                                                day: 'numeric',
                                                month: 'short',
                                            },
                                        )}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground">
                                        {rd.userName} · {rd.itemCount} toko
                                    </p>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Customer List */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold">
                            Daftar Customer
                        </h3>
                        <span className="text-xs text-muted-foreground">
                            {filteredCustomers.length} customer
                        </span>
                    </div>

                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Cari nama, kode, atau kota..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-9 h-10"
                        />
                    </div>

                    <div className="border rounded-lg max-h-[500px] overflow-y-auto">
                        {filteredCustomers.length === 0 ? (
                            <div className="p-8 text-center text-sm text-muted-foreground">
                                Customer tidak ditemukan
                            </div>
                        ) : (
                            filteredCustomers.map((customer) => {
                                const isSelected = selectedCustomerIds.includes(
                                    customer.id,
                                );
                                const orderIdx = selectedCustomerIds.indexOf(
                                    customer.id,
                                );
                                return (
                                    <button
                                        key={customer.id}
                                        type="button"
                                        onClick={() =>
                                            toggleCustomer(customer.id)
                                        }
                                        className={`w-full text-left p-3 border-b last:border-0 flex items-center gap-3 min-h-[48px] transition-colors ${
                                            isSelected
                                                ? 'bg-primary/10'
                                                : 'hover:bg-muted/50'
                                        }`}
                                    >
                                        <div
                                            className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
                                                isSelected
                                                    ? 'bg-primary border-primary text-primary-foreground'
                                                    : 'border-muted-foreground/30'
                                            }`}
                                        >
                                            {isSelected && (
                                                <Check className="h-3 w-3" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium truncate">
                                                {customer.name}
                                            </p>
                                            <p className="text-[10px] text-muted-foreground">
                                                {customer.code || '-'}
                                                {customer.city &&
                                                    ` · ${customer.city}`}
                                            </p>
                                        </div>
                                        {isSelected && (
                                            <div className="flex items-center gap-1 shrink-0">
                                                <span className="text-xs font-bold text-primary">
                                                    #{orderIdx + 1}
                                                </span>
                                            </div>
                                        )}
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Selected Order */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold">Urutan Rute</h3>
                        <span className="text-xs text-muted-foreground">
                            {selectedCustomerIds.length} toko dipilih
                        </span>
                    </div>

                    <div className="border rounded-lg max-h-[500px] overflow-y-auto">
                        {selectedCustomerIds.length === 0 ? (
                            <div className="p-8 text-center">
                                <MapPin className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-50" />
                                <p className="text-sm text-muted-foreground">
                                    Pilih customer dari daftar kiri
                                </p>
                            </div>
                        ) : (
                            selectedCustomerIds.map((customerId, idx) => {
                                const customer = customers.find(
                                    (c) => c.id === customerId,
                                );
                                if (!customer) return null;
                                return (
                                    <div
                                        key={customerId}
                                        className="flex items-center gap-3 p-3 border-b last:border-0 min-h-[48px]"
                                    >
                                        <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">
                                            {idx + 1}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium truncate">
                                                {customer.name}
                                            </p>
                                            <p className="text-[10px] text-muted-foreground">
                                                {customer.code || '-'}
                                                {customer.city &&
                                                    ` · ${customer.city}`}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    moveCustomer(
                                                        customerId,
                                                        'up',
                                                    )
                                                }
                                                disabled={idx === 0}
                                                className="p-1 hover:bg-muted rounded disabled:opacity-30"
                                            >
                                                <ChevronUp className="h-4 w-4" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    moveCustomer(
                                                        customerId,
                                                        'down',
                                                    )
                                                }
                                                disabled={
                                                    idx ===
                                                    selectedCustomerIds.length -
                                                        1
                                                }
                                                className="p-1 hover:bg-muted rounded disabled:opacity-30"
                                            >
                                                <ChevronDown className="h-4 w-4" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    removeCustomer(customerId)
                                                }
                                                className="p-1 hover:bg-destructive/10 text-destructive rounded"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
