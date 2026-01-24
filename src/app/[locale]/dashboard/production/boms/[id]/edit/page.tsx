import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BomForm, Product, BomFormProps } from '../../create/bom-form';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { getBom, getProductVariants } from '@/actions/boms';
import { canViewPrices } from '@/actions/permissions';
import { serializeData } from '@/lib/utils';
import { notFound } from 'next/navigation';

interface EditBomPageProps {
    params: Promise<{ id: string }>;
}

export default async function EditBomPage(props: EditBomPageProps) {
    const params = await props.params;
    const [bomResult, productsResult, showPrices] = await Promise.all([
        getBom(params.id),
        getProductVariants(),
        canViewPrices()
    ]);

    if (!bomResult.success || !bomResult.data) {
        notFound();
    }

    const bom = serializeData(bomResult.data);
    const products = productsResult.success ? serializeData(productsResult.data) : [];

    return (
        <div className="p-8 max-w-4xl mx-auto">
            <Link
                href="/dashboard/production/boms"
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors w-fit mb-6"
            >
                <ArrowLeft className="h-4 w-4" />
                <span className="text-sm font-medium">Back to Recipes</span>
            </Link>

            <div className="mb-8">
                <h1 className="text-3xl font-bold text-foreground">Edit Recipe</h1>
                <p className="text-muted-foreground mt-2">Modify existing production formula</p>
            </div>

            <Card className="border shadow-sm">
                <CardHeader>
                    <CardTitle>Recipe Details</CardTitle>
                    <CardDescription>
                        Update the output product and required ingredients.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <BomForm
                        products={products as Product[]}
                        initialData={bom as unknown as BomFormProps['initialData']}
                        showPrices={showPrices}
                    />
                </CardContent>
            </Card>
        </div>
    );
}
