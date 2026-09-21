'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Warehouse } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils/utils';

interface LocationSummary {
    id: string;
    name: string;
    totalSkus: number;
    lowStockCount: number;
    locationType?: string;
}
interface WarehouseNavigatorProps {
    locations: LocationSummary[];
    activeLocationIds: string[];
    totalSkus: number;
    totalLowStock: number;
    basePath?: string;
    historical?: boolean;
}

export function WarehouseNavigator({
    locations,
    activeLocationIds,
    totalSkus,
    basePath = '/warehouse/inventory',
    historical = false,
}: WarehouseNavigatorProps) {
    const searchParams = useSearchParams();
    const [search, setSearch] = useState('');
    const ids = [...new Set(activeLocationIds)];
    const hrefFor = (nextIds: string[]) => {
        const params = new URLSearchParams(searchParams.toString());
        params.delete('locationId');
        [...new Set(nextIds)].forEach((id) => params.append('locationId', id));
        return `${basePath}${params.size ? `?${params}` : ''}`;
    };
    const locationLink = (location: LocationSummary) => {
        const active = ids.includes(location.id);
        return (
            <Link
                key={location.id}
                href={hrefFor(
                    active
                        ? ids.filter((id) => id !== location.id)
                        : [...ids, location.id],
                )}
                aria-current={active ? 'true' : undefined}
                className={cn(
                    'flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-sm break-words',
                    active
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-card hover:bg-muted/50',
                )}
            >
                <span className="min-w-0">{location.name}</span>
                {location.locationType === 'CUSTOMER_OWNED' && (
                    <span className="text-xs">Milik customer</span>
                )}
                {!historical && (
                    <span className="text-xs tabular-nums">
                        ({location.totalSkus})
                    </span>
                )}
                {!historical && location.lowStockCount > 0 && (
                    <span className="rounded bg-destructive px-1.5 text-xs text-destructive-foreground">
                        {location.lowStockCount} menipis
                    </span>
                )}
            </Link>
        );
    };
    return (
        <nav
            aria-label="Filter lokasi stok"
            className="relative space-y-2 shrink-0"
        >
            <div className="flex flex-wrap items-center gap-2">
                <Link
                    href={hrefFor([])}
                    aria-current={ids.length === 0 ? 'true' : undefined}
                    className={cn(
                        'flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm',
                        ids.length === 0 &&
                            'bg-primary text-primary-foreground',
                    )}
                >
                    <Warehouse className="h-4 w-4 shrink-0" /> Semua Lokasi{' '}
                    {!historical && `(${totalSkus})`}
                </Link>
                <details className="md:hidden">
                    <summary className="min-h-11 cursor-pointer rounded-lg border px-3 py-3 text-sm">
                        Pilih lokasi{ids.length > 0 ? ` (${ids.length})` : ''}
                    </summary>
                    <div className="absolute left-0 right-0 z-30 mt-2 rounded-lg border bg-popover p-3 shadow-md">
                        <Input
                            aria-label="Cari lokasi"
                            placeholder="Cari lokasi..."
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            className="mb-2 h-11"
                        />
                        <div className="max-h-60 space-y-2 overflow-y-auto">
                            {locations
                                .filter((location) =>
                                    location.name
                                        .toLowerCase()
                                        .includes(search.toLowerCase()),
                                )
                                .map(locationLink)}
                        </div>
                    </div>
                </details>
                <div className="hidden md:contents">
                    {locations.map(locationLink)}
                </div>
            </div>
            {ids.length > 0 && (
                <div className="flex flex-wrap gap-2 md:hidden">
                    {locations
                        .filter((location) => ids.includes(location.id))
                        .map(locationLink)}
                </div>
            )}
        </nav>
    );
}
