'use client';

import { useCallback, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { DeliveryStatus } from '@prisma/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ListToolbar } from '@/components/ui/list-toolbar';
import {
    ActiveFilterChips,
    type ActiveFilterChip,
} from '@/components/ui/active-filter-chips';
import { StatusFilterChips } from '@/components/ui/status-filter-chips';
import {
    setDeliveryListParams,
    type DeliveryWorkflowGroup,
} from '@/lib/sales/delivery-list';
import { getDeliveryStatusLabel } from '@/lib/sales/delivery-status';
import { salesLabels } from '@/lib/labels';
import {
    DeliveryOrderTable,
    type DeliveryOrderRow,
} from '@/components/sales/DeliveryOrderTable';
import type { DeliveryListSort } from '@/lib/sales/delivery-list';

type StatusCounts = Record<DeliveryStatus, number>;
const GROUPS: [DeliveryWorkflowGroup, string, (keyof StatusCounts)[]][] = [
    ['needs_action', 'Perlu diproses', ['PENDING', 'LOADING']],
    ['in_transit', 'Dalam pengiriman', ['SHIPPED', 'IN_TRANSIT', 'ARRIVED']],
    ['completed', 'Selesai', ['DELIVERED']],
    ['exceptions', 'Pengecualian', ['RETURNED', 'CANCELLED']],
];
export function DeliveryWorkbenchControls({
    statusCounts,
    group,
    status,
    initialSearch,
    initialStartDate,
    initialEndDate,
    customer,
    location,
    rows,
    meta,
    filterOptions,
}: {
    statusCounts: StatusCounts;
    group?: DeliveryWorkflowGroup;
    status?: DeliveryStatus;
    initialSearch?: string;
    initialStartDate: string;
    initialEndDate: string;
    customer?: string;
    location?: string;
    rows: DeliveryOrderRow[];
    meta: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
        sort: DeliveryListSort;
        direction: 'asc' | 'desc';
    };
    filterOptions: {
        customers: { id: string; name: string }[];
        locations: { id: string; name: string }[];
    };
}) {
    const router = useRouter(),
        pathname = usePathname(),
        searchParams = useSearchParams();
    const [search, setSearch] = useState(initialSearch ?? '');
    const [startDate, setStartDate] = useState(initialStartDate);
    const [endDate, setEndDate] = useState(initialEndDate);
    const navigate = useCallback(
        (
            updates: Record<string, string | undefined>,
            replace = true,
            resetPage = true,
        ) => {
            const next = setDeliveryListParams(
                new URLSearchParams(searchParams.toString()),
                updates,
                resetPage,
            );
            const url = next.size ? pathname + '?' + next.toString() : pathname;
            if (replace) router.replace(url, { scroll: false });
            else router.push(url, { scroll: false });
        },
        [pathname, router, searchParams],
    );
    const total = Object.values(statusCounts).reduce(
        (sum, count) => sum + count,
        0,
    );
    const selected = group ?? 'all';
    const options = [
        { value: 'all', label: 'Semua', count: total },
        ...GROUPS.map(([value, label, keys]) => ({
            value,
            label,
            count: keys.reduce((sum, key) => sum + statusCounts[key], 0),
        })),
    ];
    const filters: ActiveFilterChip[] = [];
    if (initialSearch)
        filters.push({ id: 'q', label: 'Pencarian: ' + initialSearch });
    if (group)
        filters.push({
            id: 'group',
            label: options.find((o) => o.value === group)?.label ?? group,
        });
    if (status)
        filters.push({
            id: 'status',
            label: 'Status: ' + getDeliveryStatusLabel(status),
        });
    if (customer) filters.push({ id: 'customer', label: 'Customer aktif' });
    if (location) filters.push({ id: 'location', label: 'Gudang aktif' });
    const clear = (id: string) => navigate({ [id]: undefined });
    const reset = () =>
        navigate({
            q: undefined,
            group: undefined,
            status: undefined,
            customer: undefined,
            location: undefined,
        });
    return (
        <div className="space-y-4">
            <StatusFilterChips
                options={options}
                value={selected as string}
                onChange={(value) =>
                    value === 'all'
                        ? navigate({ group: undefined, status: undefined })
                        : navigate({ group: value, status: undefined })
                }
            />
            <ListToolbar
                search={
                    <form
                        className="flex min-w-0 flex-1 gap-2"
                        onSubmit={(e) => {
                            e.preventDefault();
                            navigate({ q: search.trim() || undefined });
                        }}
                    >
                        <div className="relative min-w-0 flex-1 sm:max-w-md">
                            <Search
                                aria-hidden="true"
                                className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"
                            />
                            <Input
                                aria-label="Cari Surat Jalan"
                                placeholder="Cari nomor SJ, SO, atau customer"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="h-11 pl-9"
                            />
                        </div>
                        <Button
                            type="submit"
                            variant="outline"
                            className="h-11"
                        >
                            Cari
                        </Button>
                    </form>
                }
                filters={
                    <div className="flex flex-wrap gap-2">
                        <label className="grid gap-1 text-xs text-muted-foreground">
                            Dari tanggal
                            <Input
                                aria-label="Tanggal awal Surat Jalan"
                                type="date"
                                value={startDate}
                                onChange={(event) => {
                                    const value = event.target.value;
                                    setStartDate(value);
                                    navigate({ startDate: value || undefined });
                                }}
                                className="h-11 w-auto"
                            />
                        </label>
                        <label className="grid gap-1 text-xs text-muted-foreground">
                            Sampai tanggal
                            <Input
                                aria-label="Tanggal akhir Surat Jalan"
                                type="date"
                                value={endDate}
                                onChange={(event) => {
                                    const value = event.target.value;
                                    setEndDate(value);
                                    navigate({ endDate: value || undefined });
                                }}
                                className="h-11 w-auto"
                            />
                        </label>
                        <label className="grid gap-1 text-xs text-muted-foreground">
                            Status detail
                            <select
                                aria-label="Status detail"
                                className="h-11 max-w-full rounded-md border bg-background px-3 text-sm"
                                value={status ?? ''}
                                onChange={(e) =>
                                    navigate({
                                        status: e.target.value || undefined,
                                        group: undefined,
                                    })
                                }
                            >
                                <option value="">Semua status</option>
                                {Object.values(DeliveryStatus).map((value) => (
                                    <option key={value} value={value}>
                                        {getDeliveryStatusLabel(value)}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="grid gap-1 text-xs text-muted-foreground">
                            Customer
                            <select
                                aria-label="Filter customer"
                                className="h-11 max-w-[15rem] rounded-md border bg-background px-3 text-sm"
                                value={customer ?? ''}
                                onChange={(e) =>
                                    navigate({
                                        customer: e.target.value || undefined,
                                    })
                                }
                            >
                                <option value="">Semua customer</option>
                                {filterOptions.customers.map((option) => (
                                    <option key={option.id} value={option.id}>
                                        {option.name}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="grid gap-1 text-xs text-muted-foreground">
                            Gudang
                            <select
                                aria-label="Filter gudang"
                                className="h-11 max-w-[15rem] rounded-md border bg-background px-3 text-sm"
                                value={location ?? ''}
                                onChange={(e) =>
                                    navigate({
                                        location: e.target.value || undefined,
                                    })
                                }
                            >
                                <option value="">Semua gudang</option>
                                {filterOptions.locations.map((option) => (
                                    <option key={option.id} value={option.id}>
                                        {option.name}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>
                }
            />
            <ActiveFilterChips
                filters={filters}
                onRemove={clear}
                onReset={reset}
            />
            <DeliveryOrderTable
                initialData={rows}
                server={{
                    ...meta,
                    onNavigate: (updates) => {
                        const onlyPage =
                            Object.keys(updates).length === 1 &&
                            updates.page !== undefined;
                        navigate(updates, true, !onlyPage);
                    },
                }}
                emptyMessage={
                    filters.length > 0
                        ? 'Tidak ada Surat Jalan yang cocok dengan filter aktif.'
                        : salesLabels.emptyDeliveries
                }
            />
        </div>
    );
}
