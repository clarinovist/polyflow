'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { isValidCoordinate, haversineDistance } from '@/lib/utils/geo';
import {
    getRoutePlan,
    createRoutePlan,
    publishRoutePlan,
    deleteRoutePlan,
    getRouteComplianceStats,
} from '@/actions/sales/route-plans';
import { getSalesTeamAssignedCustomersAction } from '@/actions/sales/sales-team';
import type { RouteStopListItem } from './RouteStopList';
import type { RouteMapCustomer } from './RouteMapPreview';
import type { VisitAgeInfo } from './WeeklyRouteBoard';

export type DrawerCustomer = {
    id: string;
    name: string;
    code: string | null;
    city: string | null;
    latitude?: number | null;
    longitude?: number | null;
};

export type ComplianceStats = {
    assigned: number;
    visited: number;
    extraCalls: number;
    compliance: number;
};

type UseRouteDayPlanParams = {
    open: boolean;
    date: string | null;
    userId: string | null;
    allCustomers: DrawerCustomer[];
    conflictCustomerIds: Set<string>;
    /** R6: umur kunjungan per customer, dari WeeklyRouteBoard (data getWeekBoard
     * yang sudah diambil — tidak ada query tambahan di sini). */
    lastVisitByCustomer: Map<string, VisitAgeInfo>;
    onSaved: () => void;
    onOpenChange: (open: boolean) => void;
};

/**
 * State + data logic untuk RouteDayDrawer: load plan, dirty-check, kandidat
 * terurut jarak, dan aksi simpan/publish/hapus. Dipisah dari JSX supaya file
 * tetap di bawah 400 baris (lihat AGENTS.md — RoutePlannerBoard lama 946
 * baris jadi akar masalah maintainability).
 */
export function useRouteDayPlan({
    open,
    date,
    userId,
    allCustomers,
    conflictCustomerIds,
    lastVisitByCustomer,
    onSaved,
    onOpenChange,
}: UseRouteDayPlanParams) {
    const [loading, setLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [planId, setPlanId] = useState<string | null>(null);
    const [planStatus, setPlanStatus] = useState<'DRAFT' | 'PUBLISHED' | null>(
        null,
    );
    const [items, setItems] = useState<RouteStopListItem[]>([]);
    const [initialOrder, setInitialOrder] = useState<string[]>([]);
    const [assignedIds, setAssignedIds] = useState<Set<string> | null>(null);
    const [showAllCustomers, setShowAllCustomers] = useState(false);
    const [search, setSearch] = useState('');
    const [compliance, setCompliance] = useState<ComplianceStats | null>(null);

    const customerById = useMemo(() => {
        const map = new Map<string, DrawerCustomer>();
        for (const c of allCustomers) map.set(c.id, c);
        return map;
    }, [allCustomers]);

    const loadPlan = useCallback(async () => {
        if (!date || !userId) return;
        setLoading(true);
        try {
            const [planRes, assignedRes, complianceRes] = await Promise.all([
                getRoutePlan(date, userId),
                getSalesTeamAssignedCustomersAction(userId),
                getRouteComplianceStats(date, userId),
            ]);

            if (assignedRes?.success && Array.isArray(assignedRes.data)) {
                const ids = (assignedRes.data as { customerId: string }[]).map(
                    (a) => a.customerId,
                );
                setAssignedIds(new Set(ids));
            } else {
                setAssignedIds(new Set());
            }

            if (complianceRes?.success) {
                setCompliance(complianceRes.data as ComplianceStats);
            }

            const plan = planRes?.success ? planRes.data : null;
            const planData = plan as {
                id: string;
                status: 'DRAFT' | 'PUBLISHED';
                items: {
                    customerId: string;
                    customer: DrawerCustomer;
                    _count?: { visits: number };
                }[];
            } | null;

            if (planData) {
                setPlanId(planData.id);
                setPlanStatus(planData.status);
                const nextItems: RouteStopListItem[] = planData.items.map(
                    (it) => ({
                        customerId: it.customerId,
                        name: it.customer.name,
                        code: it.customer.code,
                        city: it.customer.city,
                        latitude: it.customer.latitude ?? null,
                        longitude: it.customer.longitude ?? null,
                        locked:
                            planData.status === 'PUBLISHED' &&
                            (it._count?.visits ?? 0) > 0,
                        hasConflict: conflictCustomerIds.has(it.customerId),
                        visitAge: lastVisitByCustomer.get(it.customerId),
                    }),
                );
                setItems(nextItems);
                setInitialOrder(nextItems.map((i) => i.customerId));
            } else {
                setPlanId(null);
                setPlanStatus(null);
                setItems([]);
                setInitialOrder([]);
            }
        } catch {
            toast.error('Gagal memuat rute');
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [date, userId]);

    useEffect(() => {
        if (open && date && userId) {
            void loadPlan();
        }
    }, [open, date, userId, loadPlan]);

    const isDirty = useMemo(
        () =>
            JSON.stringify(items.map((i) => i.customerId)) !==
            JSON.stringify(initialOrder),
        [items, initialOrder],
    );

    const candidates = useMemo(() => {
        const selected = new Set(items.map((i) => i.customerId));
        const pool = allCustomers.filter((c) => !selected.has(c.id));
        const scoped = showAllCustomers
            ? pool
            : pool.filter((c) => assignedIds?.has(c.id));
        const q = search.trim().toLowerCase();
        const filtered = q
            ? scoped.filter(
                  (c) =>
                      c.name.toLowerCase().includes(q) ||
                      c.code?.toLowerCase().includes(q) ||
                      c.city?.toLowerCase().includes(q),
              )
            : scoped;

        const lastStop = items[items.length - 1];
        const lastCustomer = lastStop
            ? customerById.get(lastStop.customerId)
            : null;
        const anchor =
            lastCustomer &&
            isValidCoordinate(lastCustomer.latitude, lastCustomer.longitude)
                ? lastCustomer
                : null;

        if (!anchor) return filtered;

        return [...filtered].sort((a, b) => {
            const aHasGps = isValidCoordinate(a.latitude, a.longitude);
            const bHasGps = isValidCoordinate(b.latitude, b.longitude);
            if (aHasGps && !bHasGps) return -1;
            if (!aHasGps && bHasGps) return 1;
            if (!aHasGps && !bHasGps) return 0;
            const da = haversineDistance(
                anchor.latitude!,
                anchor.longitude!,
                a.latitude!,
                a.longitude!,
            );
            const db = haversineDistance(
                anchor.latitude!,
                anchor.longitude!,
                b.latitude!,
                b.longitude!,
            );
            return da - db;
        });
    }, [
        allCustomers,
        items,
        showAllCustomers,
        assignedIds,
        search,
        customerById,
    ]);

    const mapCustomers: RouteMapCustomer[] = useMemo(
        () =>
            items.map((it, idx) => ({
                id: it.customerId,
                name: it.name,
                code: it.code,
                city: it.city,
                latitude: it.latitude,
                longitude: it.longitude,
                sortOrder: idx + 1,
            })),
        [items],
    );

    function addCandidate(customer: DrawerCustomer) {
        setItems((prev) => [
            ...prev,
            {
                customerId: customer.id,
                name: customer.name,
                code: customer.code,
                city: customer.city,
                latitude: customer.latitude ?? null,
                longitude: customer.longitude ?? null,
                locked: false,
                hasConflict: conflictCustomerIds.has(customer.id),
                visitAge: lastVisitByCustomer.get(customer.id),
            },
        ]);
    }

    function reorderItems(orderedCustomerIds: string[]) {
        const byId = new Map(items.map((i) => [i.customerId, i]));
        setItems(
            orderedCustomerIds
                .map((id) => byId.get(id))
                .filter((i): i is RouteStopListItem => !!i),
        );
    }

    function removeItem(customerId: string) {
        setItems((prev) => prev.filter((i) => i.customerId !== customerId));
    }

    function applyOrderedIds(orderedIds: string[]) {
        const existingById = new Map(items.map((i) => [i.customerId, i]));
        const next: RouteStopListItem[] = orderedIds.map((id) => {
            const existing = existingById.get(id);
            if (existing) return existing;
            const c = customerById.get(id);
            return {
                customerId: id,
                name: c?.name ?? id,
                code: c?.code ?? null,
                city: c?.city ?? null,
                latitude: c?.latitude ?? null,
                longitude: c?.longitude ?? null,
                locked: false,
                hasConflict: conflictCustomerIds.has(id),
                visitAge: lastVisitByCustomer.get(id),
            };
        });
        setItems(next);
    }

    async function persistItems(): Promise<string | null> {
        if (!date || !userId) return null;
        if (items.length === 0) {
            toast.error('Pilih minimal 1 customer');
            return null;
        }
        const result = await createRoutePlan({
            date,
            userId,
            items: items.map((it, idx) => ({
                customerId: it.customerId,
                sortOrder: idx + 1,
            })),
        });

        if (!result?.success) {
            toast.error(
                (result as { error?: string })?.error || 'Gagal menyimpan rute',
            );
            return null;
        }
        return (result.data as { id: string }).id;
    }

    async function handleSaveDraft() {
        setIsSaving(true);
        try {
            const savedId = await persistItems();
            if (savedId) {
                toast.success(`Rute tersimpan: ${items.length} toko`);
                onSaved();
                await loadPlan();
            }
        } finally {
            setIsSaving(false);
        }
    }

    async function handlePublish() {
        setIsSaving(true);
        try {
            const savedId = await persistItems();
            if (!savedId) return;
            const pubResult = await publishRoutePlan(savedId);
            if (pubResult?.success) {
                toast.success('Rute dipublikasikan');
                onSaved();
                await loadPlan();
            } else {
                toast.error(
                    (pubResult as { error?: string })?.error ||
                        'Gagal mempublikasikan rute',
                );
            }
        } finally {
            setIsSaving(false);
        }
    }

    async function handleDelete() {
        if (!planId) return;
        setIsSaving(true);
        try {
            const result = await deleteRoutePlan(planId);
            if (result?.success) {
                toast.success('Rute dihapus');
                onSaved();
                onOpenChange(false);
            } else {
                toast.error(
                    (result as { error?: string })?.error ||
                        'Gagal menghapus rute',
                );
            }
        } finally {
            setIsSaving(false);
        }
    }

    return {
        loading,
        isSaving,
        setIsSaving,
        planId,
        planStatus,
        items,
        isDirty,
        assignedIds,
        showAllCustomers,
        setShowAllCustomers,
        search,
        setSearch,
        compliance,
        candidates,
        mapCustomers,
        customerById,
        addCandidate,
        reorderItems,
        removeItem,
        applyOrderedIds,
        handleSaveDraft,
        handlePublish,
        handleDelete,
    };
}
