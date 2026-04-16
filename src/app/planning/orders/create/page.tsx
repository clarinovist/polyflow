import { ProductionOrderForm, ProductionOrderFormProps } from './production-order-form';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { serializeData } from '@/lib/utils/utils';
import { getProductionFormData } from '@/actions/production/production';
import { ProductionGlossary } from '@/components/production/ProductionGlossary';
import { getSalesOrderById } from '@/actions/sales/sales';

export default async function CreateProductionOrderPage({
    searchParams
}: {
    searchParams: Promise<{ salesOrderId?: string, intent?: 'internal' }>
}) {
    const resolvedSearchParams = await searchParams;
    const [rawDataRes, linkedSalesOrderRes] = await Promise.all([
        getProductionFormData(),
        resolvedSearchParams.salesOrderId ? getSalesOrderById(resolvedSearchParams.salesOrderId) : Promise.resolve(null)
    ]);
    const rawData = rawDataRes.success && rawDataRes.data ? rawDataRes.data : { boms: [], locations: [], operators: [], helpers: [], machines: [], rawMaterials: [] };
    // Only destructure what we need
    const { boms, locations, machines, customers } = serializeData(rawData) as unknown as ProductionOrderFormProps & { customers: unknown[] };
    const salesOrderId = resolvedSearchParams.salesOrderId;
    const intent = resolvedSearchParams.intent;
    const linkedSalesOrder = linkedSalesOrderRes && linkedSalesOrderRes.success && linkedSalesOrderRes.data ? linkedSalesOrderRes.data : null;

    return (
        <div className="p-6 md:p-8 max-w-7xl mx-auto">
            <Link
                href="/planning/orders"
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors w-fit mb-6"
            >
                <ArrowLeft className="h-4 w-4" />
                <span className="text-sm font-medium">Back to Orders</span>
            </Link>

            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-foreground">Create Work Order</h1>
                    <p className="text-muted-foreground mt-2">Plan a new manufacturing job</p>
                </div>
                <div>
                    <ProductionGlossary />
                </div>
            </div>

            <ProductionOrderForm
                boms={boms}
                locations={locations}
                machines={machines}
                customers={customers || []}
                salesOrderId={salesOrderId}
                creationIntent={intent}
                linkedSalesOrder={linkedSalesOrder ? {
                    id: linkedSalesOrder.id,
                    orderNumber: linkedSalesOrder.orderNumber,
                    orderType: linkedSalesOrder.orderType,
                    customerName: linkedSalesOrder.customer?.name || null,
                } : undefined}
            />
        </div>
    );
}
