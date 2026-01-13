import { getDashboardStats, getStockMovements } from '@/actions/inventory';
import { getProductionOrders } from '@/actions/production';
import DashboardClient from './DashboardClient';

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
            stats={serializeData(stats) as any}
            productionOrders={serializeData(productionOrders) as any}
            recentMovements={serializeData(recentMovements) as any}
        />
    );
}
