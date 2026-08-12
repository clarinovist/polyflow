import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { getPerformanceMetricsSummary } from '@/actions/admin/performance-metrics';
import { PRODUCTION_ORDERS_LIST_ROUTE } from '@/lib/constants/production';
import {
    SALES_ORDERS_LIST_ROUTE,
    PURCHASE_ORDERS_LIST_ROUTE,
    DELIVERY_ORDERS_LIST_ROUTE,
    SALES_INVOICES_LIST_ROUTE,
} from '@/lib/constants/performance';
import { PerformanceRouteCard } from '@/components/admin/PerformanceRouteCard';
import { performanceLabels as L } from '@/lib/labels/admin';

// Routes with an active PerformanceMetric writer. Extend when another route
// gets instrumented (see writer-side comments in each source file below).
const MONITORED_ROUTES = [
    { key: PRODUCTION_ORDERS_LIST_ROUTE, label: L.routeProductionOrdersList },
    { key: SALES_ORDERS_LIST_ROUTE, label: L.routeSalesOrdersList },
    { key: PURCHASE_ORDERS_LIST_ROUTE, label: L.routePurchaseOrdersList },
    { key: DELIVERY_ORDERS_LIST_ROUTE, label: L.routeDeliveryOrdersList },
    { key: SALES_INVOICES_LIST_ROUTE, label: L.routeSalesInvoicesList },
];

export default async function PerformancePage() {
    const session = await auth();

    if (!session?.user || !session.user.isSuperAdmin) {
        redirect('/dashboard');
    }

    const summariesByRoute = await Promise.all(
        MONITORED_ROUTES.map((route) =>
            getPerformanceMetricsSummary(route.key),
        ),
    );

    return (
        <div className="flex-1 space-y-4 p-8 pt-6">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">{L.title}</h2>
                <p className="text-muted-foreground mt-1">{L.description}</p>
            </div>

            {MONITORED_ROUTES.map((route, index) => (
                <PerformanceRouteCard
                    key={route.key}
                    label={route.label}
                    summaries={summariesByRoute[index]}
                />
            ))}
        </div>
    );
}
