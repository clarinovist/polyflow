import { ProductionOrderForm, ProductionOrderFormProps } from './production-order-form';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { serializeData } from '@/lib/utils/utils';
import { getProductionFormData } from '@/actions/production/production';
import { ProductionGlossary } from '@/components/production/ProductionGlossary';

export default async function CreateProductionOrderPage({
    searchParams
}: {
    searchParams: Promise<{ salesOrderId?: string; variantId?: string; qtyHint?: string; priority?: string }>
}) {
    const resolvedSearchParams = await searchParams;
    const rawDataRes = await getProductionFormData();
    const rawData = rawDataRes.success && rawDataRes.data ? rawDataRes.data : { boms: [], locations: [], operators: [], helpers: [], machines: [], rawMaterials: [] };
    // Only destructure what we need
    const { boms, locations, machines, customers, rawMaterials } = serializeData(rawData) as unknown as ProductionOrderFormProps & { customers: unknown[]; rawMaterials: unknown[] };
    const salesOrderId = resolvedSearchParams.salesOrderId;
    const variantId = resolvedSearchParams.variantId;
    const qtyHint = resolvedSearchParams.qtyHint ? Number(resolvedSearchParams.qtyHint) : undefined;
    const priorityHint = resolvedSearchParams.priority as "URGENT" | "NORMAL" | "LOW" | undefined;

    return (
        <div className="p-6 md:p-8 max-w-7xl mx-auto">
            <Link
                href="/production/orders"
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors w-fit mb-6"
            >
                <ArrowLeft className="h-4 w-4" />
                <span className="text-sm font-medium">Kembali ke Daftar Order</span>
            </Link>

            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-foreground">Buat SPK (Work Order)</h1>
                    <p className="text-muted-foreground mt-2">Rencanakan pekerjaan produksi: resep, target, mesin, dan alur material.</p>
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
                rawMaterials={(rawMaterials || []) as ProductionOrderFormProps["rawMaterials"]}
                salesOrderId={salesOrderId}
                variantId={variantId}
                qtyHint={qtyHint}
                priorityHint={priorityHint}
            />
        </div>
    );
}
