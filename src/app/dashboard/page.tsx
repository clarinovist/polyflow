import { getDashboardStats, getStockMovements } from '@/actions/inventory';
import { getProductionOrders } from '@/actions/production';
import DashboardClient, { DashboardStats, ProductionOrder, StockMovement } from './DashboardClient';

import { serializeData } from '@/lib/utils';

export default async function DashboardPage() {
    // Fetch all dashboard data in parallel
    const [stats, productionOrders, recentMovements] = await Promise.all([
        getDashboardStats(),
        getProductionOrders(),
        getStockMovements(20)
    ]);

    return (
        <DashboardClient
            stats={serializeData(stats) as DashboardStats}
            productionOrders={serializeData(productionOrders) as ProductionOrder[]}
            recentMovements={serializeData(recentMovements) as StockMovement[]}
        />
    );
}
