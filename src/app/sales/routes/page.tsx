import 'leaflet/dist/leaflet.css';
import { listRoutePlans } from '@/actions/sales/route-plans';
import { getCustomers } from '@/actions/sales/customer';
import { RoutePlannerBoard } from '@/components/sales/routes/RoutePlannerBoard';
import { serializeData } from '@/lib/utils/utils';

export default async function SalesRoutesPage() {
    const [plansRes, customersRes] = await Promise.all([
        listRoutePlans({}),
        getCustomers(),
    ]);

    const plans =
        plansRes?.success && plansRes.data ? serializeData(plansRes.data) : [];
    const customers =
        customersRes?.success && customersRes.data
            ? serializeData(customersRes.data)
            : [];

    return (
        <div className="p-4 md:p-6 lg:p-8 space-y-6">
            <RoutePlannerBoard plans={plans} customers={customers} />
        </div>
    );
}
