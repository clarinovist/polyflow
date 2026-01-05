import { getProducts } from '@/actions/product';
import { ProductTable } from '@/components/products/ProductTable';
import { ProductGlossary } from '@/components/products/ProductGlossary';
import { ImportDialog } from '@/components/products/ImportDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus } from 'lucide-react';
import Link from 'next/link';

export default async function ProductsPage() {
    const products = await getProducts();

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
        <div className="container mx-auto py-8">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Product Master</CardTitle>
                    <div className="flex items-center gap-2">
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
