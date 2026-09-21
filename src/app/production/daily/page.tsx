import { auth } from '@/auth';
import { getDailyBoardData } from '@/actions/production/daily-board-data';
import { serializeData } from '@/lib/utils/utils';
import { ProductionOrderViews } from '@/components/production/ProductionOrderViews';
import {
    DailyProductionDashboard,
    type Order,
    type Bom,
    type Machine,
} from '@/components/production/DailyProductionDashboard';

export const dynamic = 'force-dynamic';

export default async function DailyProductionPage() {
    const session = await auth();

    // Single round-trip: active orders (+executions), default BOMs,
    // active machines, and the per-tenant machine stage map.
    // (Previously 4 actions fetched ALL orders incl. COMPLETED/CANCELLED,
    // all BOMs with items/inventories, and nested machine executions —
    // plan: docs/plan/2026-09-02-production-daily-slim-and-permissions-cache.md)
    const res = await getDailyBoardData();
    const { orders, boms, machines, machineStageMap } =
        res.success && res.data
            ? res.data
            : { orders: [], boms: [], machines: [], machineStageMap: {} };

    return (
        <div className="flex flex-col gap-6">
            <div>
                <h1 className="text-2xl font-bold text-foreground">
                    SPK
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Board Proses — SPK siap produksi, sedang jalan, dan menunggu
                    bahan, termasuk dari hari sebelumnya. Gunakan Daftar untuk
                    pencarian dan status lainnya.
                </p>

            </div>

            <ProductionOrderViews current="board" />

            <DailyProductionDashboard
                orders={serializeData(orders) as unknown as Order[]}
                boms={serializeData(boms) as unknown as Bom[]}
                machines={serializeData(machines) as unknown as Machine[]}
                machineStageMap={machineStageMap}
                userId={session?.user?.id}
            />
        </div>
    );
}
