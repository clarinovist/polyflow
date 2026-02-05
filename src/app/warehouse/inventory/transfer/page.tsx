import { getInventoryStats, getLocations, getProductVariants, getStockMovements } from '@/actions/inventory';
import { TransferForm } from '@/components/warehouse/inventory/TransferForm';
import { QuickStockCheck } from '@/components/warehouse/inventory/QuickStockCheck';
import { RecentTransfers } from '@/components/warehouse/inventory/RecentTransfers';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft, ArrowLeftRight } from 'lucide-react';
import { Metadata } from 'next';
import { serializeData } from '@/lib/utils';

export const metadata: Metadata = {
    title: 'Stock Transfer | PolyFlow Warehouse',
};

export default async function WarehouseTransferPage() {
    const [liveInventory, locations, productsData, recentMovements] = await Promise.all([
        getInventoryStats(),
        getLocations(),
        getProductVariants(),
        getStockMovements(10),
    ]);

    const formLocations = locations.map(l => ({ id: l.id, name: l.name }));
    const formProducts = productsData.map(p => ({ id: p.id, name: p.name, skuCode: p.skuCode }));
    const liveInventorySimple = serializeData(liveInventory) as any;

    // Serialize movements to plain objects for Client Component
    const recentMovementsSerialized = serializeData(recentMovements) as any;

    return (
        <div className="flex-1 space-y-4 p-8 pt-6">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                        <ArrowLeftRight className="h-4 w-4" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-foreground tracking-tight">Stock Transfer</h2>
                        <p className="text-xs text-muted-foreground">Move stock between locations</p>
                    </div>
                </div>
                <Button variant="outline" size="sm" asChild className="h-8 text-xs gap-2">
                    <Link href="/warehouse/inventory">
                        <ArrowLeft className="h-3.5 w-3.5" /> Back to Inventory
                    </Link>
                </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                {/* Main Form Area - 2/3 Width */}
                <div className="lg:col-span-2">
                    <TransferForm
                        locations={formLocations}
                        products={formProducts}
                        inventory={liveInventorySimple}
                    />
                </div>

                {/* Sidebar Area - 1/3 Width */}
                <div className="space-y-6 lg:col-span-1">
                    <QuickStockCheck
                        products={formProducts}
                        locations={formLocations}
                    />

                    <RecentTransfers
                        movements={recentMovementsSerialized}
                    />
                </div>
            </div>
        </div>
    );
}
