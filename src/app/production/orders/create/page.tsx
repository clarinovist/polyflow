import {
    ProductionOrderForm,
    ProductionOrderFormProps,
} from './production-order-form';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { serializeData } from '@/lib/utils/utils';
import { getProductionFormData } from '@/actions/production/production';
import { ProductionGlossary } from '@/components/production/ProductionGlossary';

export default async function CreateProductionOrderPage({
    searchParams,
}: {
    searchParams: Promise<{
        salesOrderId?: string;
        variantId?: string;
        qtyHint?: string;
        priority?: string;
    }>;
}) {
    const resolvedSearchParams = await searchParams;
    const rawDataRes = await getProductionFormData();
    const rawData =
        rawDataRes.success && rawDataRes.data
            ? rawDataRes.data
            : {
                  boms: [],
                  locations: [],
                  operators: [],
                  helpers: [],
                  machines: [],
                  rawMaterials: [],
                  rawMaterialStock: [],
              };
    // Only destructure what we need
    const {
        boms,
        locations,
        machines,
        customers,
        rawMaterials,
        rawMaterialStock,
        machineStageMap,
    } = serializeData(rawData) as unknown as ProductionOrderFormProps & {
        customers: unknown[];
        rawMaterials: unknown[];
    };
    const salesOrderId = resolvedSearchParams.salesOrderId;
    const variantId = resolvedSearchParams.variantId;
    const qtyHint = resolvedSearchParams.qtyHint
        ? Number(resolvedSearchParams.qtyHint)
        : undefined;
    const priorityHint = resolvedSearchParams.priority as
        | 'URGENT'
        | 'NORMAL'
        | 'LOW'
        | undefined;

    return (
        <div className="mx-auto max-w-[1440px] py-2">
            <Link
                href="/production/orders"
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors w-fit mb-6"
            >
                <ArrowLeft className="h-4 w-4" />
                <span className="text-sm font-medium">
                    Kembali ke daftar SPK
                </span>
            </Link>

            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-foreground">
                        Buat SPK
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Satu SPK untuk satu tahap produksi. Tentukan produk,
                        target, dan alur bahan.
                    </p>
                </div>
                <div>
                    <ProductionGlossary />
                </div>
            </div>

            <ProductionOrderForm
                boms={boms}
                locations={locations}
                machines={machines}
                machineStageMap={machineStageMap}
                customers={customers || []}
                rawMaterials={
                    (rawMaterials ||
                        []) as ProductionOrderFormProps['rawMaterials']
                }
                rawMaterialStock={
                    (rawMaterialStock ||
                        []) as ProductionOrderFormProps['rawMaterialStock']
                }
                salesOrderId={salesOrderId}
                variantId={variantId}
                qtyHint={qtyHint}
                priorityHint={priorityHint}
            />
        </div>
    );
}
