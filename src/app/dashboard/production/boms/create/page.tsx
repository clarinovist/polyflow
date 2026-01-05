import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BomForm } from './bom-form';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { getProductVariants } from '@/actions/boms';
import { serializeData } from '@/lib/utils';

export default async function CreateBomPage() {
    const result = await getProductVariants();
    const products = result.success ? serializeData(result.data) : [];

    return (
        <div className="p-8 max-w-4xl mx-auto">
            <Link
                href="/dashboard/production/boms"
                className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors w-fit mb-6"
            >
                <ArrowLeft className="h-4 w-4" />
                <span className="text-sm font-medium">Back to Recipes</span>
            </Link>

            <div className="mb-8">
                <h1 className="text-3xl font-bold text-slate-900">Create New Recipe</h1>
                <p className="text-slate-600 mt-2">Define a new Bill of Materials for production</p>
            </div>

            <Card className="border-none shadow-sm">
                <CardHeader>
                    <CardTitle>Recipe Details</CardTitle>
                    <CardDescription>
                        Define the output product and required ingredients.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <BomForm products={products} />
                </CardContent>
            </Card>
        </div>
    );
}
