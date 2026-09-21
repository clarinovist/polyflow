import {
    getInventoryStats,
    getLocations,
    getProductVariants,
} from '@/actions/inventory/inventory';

import { InventoryLoadError } from '@/components/warehouse/inventory/InventoryLoadError';
import { AdjustmentForm } from '@/components/warehouse/inventory/AdjustmentForm';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft, PackagePlus } from 'lucide-react';
import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Penyesuaian Stok | PolyFlow Warehouse',
};

export default async function WarehouseAdjustmentPage() {
    const [liveInventoryRes, locationsRes, productsDataRes] = await Promise.all(
        [getInventoryStats(), getLocations(), getProductVariants()],
    );

    const liveInventory =
        liveInventoryRes.success && liveInventoryRes.data
            ? liveInventoryRes.data
            : [];
    const locations =
        locationsRes.success && locationsRes.data ? locationsRes.data : [];
    const productsData =
        productsDataRes.success && productsDataRes.data
            ? productsDataRes.data
            : [];

    const formLocations = locations.map((l) => ({ id: l.id, name: l.name }));
    const formProducts = productsData.map((p) => ({
        id: p.id,
        name: p.name,
        skuCode: p.skuCode,
        primaryUnit: p.primaryUnit,
    }));
    const liveInventorySimple = liveInventory.map((i) => ({
        locationId: i.locationId,
        productVariantId: i.productVariantId,
        quantity: i.quantity.toNumber(),
    }));

    if (
        !liveInventoryRes.success ||
        !locationsRes.success ||
        !productsDataRes.success
    ) {
        return (
            <InventoryLoadError message="Gagal memuat data penyesuaian. Form belum dapat digunakan." />
        );
    }
    return (
        <div className="flex-1 min-w-0 space-y-4">
            <header className="flex flex-wrap gap-3 items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                        <PackagePlus className="h-4 w-4" />
                    </div>
                    <div>
                        <h1 className="text-lg font-bold text-foreground">
                            Penyesuaian Stok
                        </h1>
                        <p className="text-xs text-muted-foreground">
                            Koreksi saldo dengan alasan; bukan transfer atau
                            hitung opname.
                        </p>
                    </div>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    asChild
                    className="h-8 text-xs"
                >
                    <Link href="/warehouse/inventory">
                        <ArrowLeft className="mr-2 h-3 w-3" /> Kembali ke
                        Inventaris
                    </Link>
                </Button>
            </header>
            <AdjustmentForm
                locations={formLocations}
                products={formProducts}
                inventory={liveInventorySimple}
            />
        </div>
    );
}
