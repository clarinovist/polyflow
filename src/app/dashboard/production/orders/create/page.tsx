import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ProductionOrderForm } from './production-order-form';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { serializeData } from '@/lib/utils';
import { getProductionFormData } from '@/actions/production';
import { getWorkShifts } from '@/actions/work-shifts';
import { ProductionGlossary } from '@/components/production/ProductionGlossary';
// ... existing imports

export default async function CreateProductionOrderPage() {
    const rawData = await getProductionFormData();
    const workShiftsResult = await getWorkShifts();
    const { boms, machines, locations, operators, helpers } = serializeData(rawData);
    const workShifts = workShiftsResult.success && workShiftsResult.data ? workShiftsResult.data : [];

    return (
        <div className="p-8 max-w-4xl mx-auto">
            <Link
                href="/dashboard/production/orders"
                className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors w-fit mb-6"
            >
                <ArrowLeft className="h-4 w-4" />
                <span className="text-sm font-medium">Back to Orders</span>
            </Link>

            <div className="mb-8">
                <h1 className="text-3xl font-bold text-slate-900">Create Production Order</h1>
                <p className="text-slate-600 mt-2">Plan a new manufacturing job</p>
            </div>

            <Card className="border-none shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>Order Details</CardTitle>
                        <CardDescription>
                            Select a recipe (BOM) and assign resources.
                        </CardDescription>
                    </div>
                    <ProductionGlossary />
                </CardHeader>
                <CardContent>
                    <ProductionOrderForm
                        boms={boms}
                        machines={machines}
                        locations={locations}
                        operators={operators}
                        helpers={helpers}
                        workShifts={workShifts}
                    />
                </CardContent>
            </Card>
        </div>
    );
}
