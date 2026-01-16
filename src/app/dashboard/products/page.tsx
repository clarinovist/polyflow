import { getProducts } from '@/actions/product';
import { ProductTable } from '@/components/products/ProductTable';
import { ProductGlossary } from '@/components/products/ProductGlossary';
import { ImportDialog } from '@/components/products/ImportDialog';
import { ProductTypeFilter } from '@/components/products/ProductTypeFilter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { ProductType } from '@prisma/client';

export default async function ProductsPage({
    searchParams,
}: {
    searchParams: Promise<{ type?: string }>;
}) {
    // In Next.js 15+, searchParams is a Promise
    const params = await searchParams;

    // Validate type param against enum
    const typeParam = params.type;
    const isValidType = typeParam && Object.values(ProductType).includes(typeParam as ProductType);

    const products = await getProducts({
        type: isValidType ? (typeParam as ProductType) : undefined
    });

    // Serialize Decimal fields for client component
    const serializedProducts = JSON.parse(
        JSON.stringify(products, (key, value) => {
            // Convert Decimal to number
            if (value && typeof value === 'object' && value.constructor?.name === 'Decimal') {
                return parseFloat(value.toString());
            }
            return value;
        })
    );

    return (
        <div className="p-6 space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-foreground">Products</h1>
                <p className="text-muted-foreground mt-2">Manage your product catalog</p>
            </div>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Product Master</CardTitle>
                    <div className="flex items-center gap-2">
                        <ProductTypeFilter />
                        <ProductGlossary />
                        <ImportDialog />
                        <Link href="/dashboard/products/create">
                            <Button>
                                <Plus className="h-4 w-4 mr-2" />
                                Create Product
                            </Button>
                        </Link>
                    </div>
                </CardHeader>
                <CardContent>
                    <ProductTable products={serializedProducts} />
                </CardContent>
            </Card>
        </div>
    );
}
