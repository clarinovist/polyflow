import { auth } from '@/auth';
import { hasAnyRole } from '@/lib/auth/roles';
import {
    getProductionOrder,
    getProductionFormData,
} from '@/actions/production/production';
import { getWorkShifts } from '@/actions/admin/work-shifts';
import { getActiveOrderNav } from '@/actions/production/active-order-nav';
import { ProductionOrderDetail } from './production-order-detail';
import { ActiveOrderStrip } from '@/components/production/ActiveOrderStrip';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { serializeData } from '@/lib/utils/utils';
import { ExtendedProductionOrder } from '@/components/production/order-detail/types';
import {
    ProductVariant,
    Location,
    Employee,
    Machine,
    WorkShift,
} from '@prisma/client';

interface PageProps {
    params: Promise<{
        id: string;
    }>;
}

export default async function ProductionDetailPage(props: PageProps) {
    const params = await props.params;
    const session = await auth();
    const rawOrder = await getProductionOrder(params.id);
    const order = serializeData(rawOrder);

    if (!order) {
        notFound();
    }

    const formDataRes = await getProductionFormData();
    const {
        locations,
        operators,
        helpers,
        machines,
        rawMaterials,
        machineStageMap,
        customers,
    } =
        formDataRes.success && formDataRes.data
            ? formDataRes.data
            : {
                  locations: [],
                  operators: [],
                  helpers: [],
                  machines: [],
                  rawMaterials: [],
                  machineStageMap: {},
                  customers: [],
              };
    const workShiftsResult = await getWorkShifts();
    const workShifts =
        workShiftsResult.success && workShiftsResult.data
            ? workShiftsResult.data
            : [];

    // Active-SPK strip: lets the operator hop to the next work order without
    // going back to /production/daily (telemetry showed 939 such round trips
    // in 30 days). Failure here must not break the detail page.
    const navResult = await getActiveOrderNav();
    const activeOrderNav =
        navResult.success && navResult.data ? navResult.data : [];

    return (
        <div className="mx-auto max-w-[1600px] py-2">
            <Link
                href="/production/orders"
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors w-fit mb-4 min-h-11"
            >
                <ArrowLeft className="h-4 w-4" />
                <span className="text-sm font-medium">
                    Kembali ke Daftar SPK
                </span>
            </Link>

            <ActiveOrderStrip
                orders={activeOrderNav}
                currentOrderId={params.id}
            />

            <ProductionOrderDetail
                order={order as unknown as ExtendedProductionOrder}
                canEditCustomers={
                    !!session?.user &&
                    hasAnyRole(session.user, ['ADMIN', 'PLANNING'])
                }
                formData={{
                    customers: customers ?? [],
                    locations: locations as unknown as Location[],
                    operators: operators as unknown as Employee[],
                    helpers: helpers as unknown as Employee[],
                    machines: machines as unknown as Machine[],
                    workShifts: workShifts as unknown as WorkShift[],
                    rawMaterials: serializeData(
                        rawMaterials,
                    ) as unknown as ProductVariant[],
                    machineStageMap: serializeData(machineStageMap ?? {}),
                }}
            />
        </div>
    );
}
