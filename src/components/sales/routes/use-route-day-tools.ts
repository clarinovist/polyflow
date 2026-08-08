'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { isValidCoordinate } from '@/lib/utils/geo';
import {
    copyLastWeekRoute,
    copyRouteFromDate,
    importRouteExcel,
    optimizeRouteNearestNeighbor,
    listRecentRouteDates,
} from '@/actions/sales/route-plans';
import type { RouteStopListItem } from './RouteStopList';

export type TemplateDate = {
    date: string | Date;
    userName: string;
    itemCount: number;
};

function extractOrderedIds(result: {
    data?: { items?: { customerId: string; sortOrder: number }[] };
}): string[] {
    return (result.data?.items ?? [])
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((i) => i.customerId);
}

type UseRouteDayToolsParams = {
    date: string | null;
    userId: string | null;
    planId: string | null;
    items: RouteStopListItem[];
    applyOrderedIds: (orderedIds: string[]) => void;
    setIsSaving: (value: boolean) => void;
};

/**
 * Aksi utilitas RouteDayDrawer yang jarang dipakai (menu overflow "Lainnya"):
 * salin minggu lalu, template, import Excel, optimasi nearest-neighbor.
 * Dipisah dari use-route-day-plan.ts (yang menangani CRUD inti) supaya
 * masing-masing file tetap fokus dan di bawah 400 baris.
 */
export function useRouteDayTools({
    date,
    userId,
    planId,
    items,
    applyOrderedIds,
    setIsSaving,
}: UseRouteDayToolsParams) {
    const [templateDates, setTemplateDates] = useState<TemplateDate[]>([]);
    const [showTemplatePicker, setShowTemplatePicker] = useState(false);

    async function handleCopyLastWeek() {
        if (!date || !userId) return;
        setIsSaving(true);
        try {
            const result = await copyLastWeekRoute(date, userId);
            if (result?.success) {
                const orderedIds = extractOrderedIds(result);
                applyOrderedIds(orderedIds);
                toast.success(`Berhasil menyalin ${orderedIds.length} toko`);
            } else {
                toast.error(
                    (result as { error?: string })?.error ||
                        'Rute minggu lalu tidak ditemukan',
                );
            }
        } finally {
            setIsSaving(false);
        }
    }

    async function handleLoadTemplates() {
        if (!userId) return;
        const result = await listRecentRouteDates(userId);
        if (result?.success && result.data) {
            setTemplateDates(result.data as TemplateDate[]);
            setShowTemplatePicker(true);
        }
    }

    async function handleCopyFromTemplate(fromDate: string) {
        if (!date || !userId) return;
        setIsSaving(true);
        try {
            const result = await copyRouteFromDate(fromDate, date, userId);
            if (result?.success) {
                const orderedIds = extractOrderedIds(result);
                applyOrderedIds(orderedIds);
                toast.success(`Berhasil menyalin ${orderedIds.length} toko`);
                setShowTemplatePicker(false);
            } else {
                toast.error(
                    (result as { error?: string })?.error ||
                        'Gagal menyalin rute',
                );
            }
        } finally {
            setIsSaving(false);
        }
    }

    function handleImportExcel() {
        if (!date || !userId) return;
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.xlsx,.xls,.csv';
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;
            try {
                const XLSX = await import('xlsx');
                const buf = await file.arrayBuffer();
                const workbook = XLSX.read(buf);
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
                    toast.error('Tidak ada kode customer ditemukan di file');
                    return;
                }
                setIsSaving(true);
                const result = await importRouteExcel({
                    date,
                    userId,
                    customerCodes: codes,
                });
                if (result?.success) {
                    const orderedIds = extractOrderedIds(result);
                    applyOrderedIds(orderedIds);
                    toast.success(`Import berhasil: ${orderedIds.length} toko`);
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
    }

    async function handleOptimize() {
        if (!planId) {
            toast.error('Simpan rute terlebih dahulu sebelum optimasi');
            return;
        }
        const withoutGps = items.filter(
            (i) => !isValidCoordinate(i.latitude, i.longitude),
        );
        if (withoutGps.length > 0) {
            toast.warning(
                `${withoutGps.length} toko tanpa GPS akan ditaruh di akhir urutan tanpa dioptimasi`,
            );
        }
        setIsSaving(true);
        try {
            const result = await optimizeRouteNearestNeighbor(planId);
            if (result?.success) {
                const data = result.data as {
                    orderedCustomerIds?: string[];
                };
                if (data?.orderedCustomerIds) {
                    applyOrderedIds(data.orderedCustomerIds);
                }
                toast.success('Rute dioptimasi (nearest-neighbor)');
            } else {
                toast.error(
                    (result as { error?: string })?.error ||
                        'Gagal optimasi rute',
                );
            }
        } finally {
            setIsSaving(false);
        }
    }

    return {
        templateDates,
        showTemplatePicker,
        setShowTemplatePicker,
        handleCopyLastWeek,
        handleLoadTemplates,
        handleCopyFromTemplate,
        handleImportExcel,
        handleOptimize,
    };
}
