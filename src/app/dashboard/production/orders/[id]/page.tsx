import { getProductionOrder, getProductionFormData } from '@/actions/production';
import { getWorkShifts } from '@/actions/work-shifts';
import { ProductionOrderDetail } from './production-order-detail';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface PageProps {
    params: Promise<{
        id: string;
    }>
}

import { serializeData } from '@/lib/utils';
// ... imports

export default async function ProductionDetailPage(props: PageProps) {
    const params = await props.params;
    const rawOrder = await getProductionOrder(params.id);
    const order = serializeData(rawOrder);

    if (!order) {
        notFound();
    }

    const { locations, operators, helpers } = await getProductionFormData();
    const workShiftsResult = await getWorkShifts();
    const workShifts = workShiftsResult.success && workShiftsResult.data ? workShiftsResult.data : [];

    return (
        <div className="p-8 max-w-7xl mx-auto">
            <Link
                href="/dashboard/production/orders"
                className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors w-fit mb-6"
            >
                <ArrowLeft className="h-4 w-4" />
                <span className="text-sm font-medium">Back to Orders</span>
            </Link>

            <ProductionOrderDetail
                order={order}
                formData={{
                    locations,
                    operators,
                    helpers,
                    workShifts
                }}
            />
        </div>
    );
}
