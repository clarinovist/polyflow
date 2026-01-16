import { ProductionOrderForm } from './production-order-form';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { serializeData } from '@/lib/utils';
import { getProductionFormData } from '@/actions/production';
import { ProductionGlossary } from '@/components/production/ProductionGlossary';

interface FormData {
    boms: any[];
    locations: any[];
}

export default async function CreateProductionOrderPage() {
    const rawData = await getProductionFormData();
    // Only destructure what we need
    const { boms, locations } = serializeData(rawData) as unknown as FormData;

    return (
        <div className="p-6 md:p-8 max-w-7xl mx-auto">
            <Link
                href="/dashboard/production/orders"
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors w-fit mb-6"
            >
                <ArrowLeft className="h-4 w-4" />
                <span className="text-sm font-medium">Back to Orders</span>
            </Link>

            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-foreground">Create Production Order</h1>
                    <p className="text-muted-foreground mt-2">Plan a new manufacturing job</p>
                </div>
                <div>
                    <ProductionGlossary />
                </div>
            </div>

            <ProductionOrderForm
                boms={boms}
                locations={locations}
            />
        </div>
    );
}
