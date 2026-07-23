import { getProductionOrder, getProductionFormData } from '@/actions/production/production';
import { getWorkShifts } from '@/actions/admin/work-shifts';
import { ProductionOrderDetail } from './production-order-detail';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { serializeData } from '@/lib/utils/utils';
import { ExtendedProductionOrder } from '@/components/production/order-detail/types';
import { ProductVariant, Location, Employee, Machine, WorkShift } from '@prisma/client';

interface PageProps {
    params: Promise<{
        id: string;
    }>
}

export default async function ProductionDetailPage(props: PageProps) {
    const params = await props.params;
    const rawOrder = await getProductionOrder(params.id);
    const order = serializeData(rawOrder);

    if (!order) {
        notFound();
    }

    const formDataRes = await getProductionFormData();
    const { locations, operators, helpers, machines, rawMaterials } = formDataRes.success && formDataRes.data 
        ? formDataRes.data 
        : { locations: [], operators: [], helpers: [], machines: [], rawMaterials: [] };
    const workShiftsResult = await getWorkShifts();
    const workShifts = workShiftsResult.success && workShiftsResult.data ? workShiftsResult.data : [];

    return (
        <div className="p-8 max-w-7xl mx-auto">
            <Link
                href="/production/orders"
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors w-fit mb-6"
            >
                <ArrowLeft className="h-4 w-4" />
                <span className="text-sm font-medium">Kembali ke Daftar SPK</span>
            </Link>

            <ProductionOrderDetail
                order={order as unknown as ExtendedProductionOrder}
                formData={{
                    locations: locations as unknown as Location[],
                    operators: operators as unknown as Employee[],
                    helpers: helpers as unknown as Employee[],
                    machines: machines as unknown as Machine[],
                    workShifts: workShifts as unknown as WorkShift[],
                    rawMaterials: serializeData(rawMaterials) as unknown as ProductVariant[]
                }}
            />
        </div>
    );
}
