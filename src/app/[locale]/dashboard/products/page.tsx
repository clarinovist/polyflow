import { getProducts } from '@/actions/product';
import { canViewPrices } from '@/actions/permissions';
import { ProductTable } from '@/components/products/ProductTable';
import { ProductGlossary } from '@/components/products/ProductGlossary';
import { ImportDialog } from '@/components/products/ImportDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Plus } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { ProductType } from '@prisma/client';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

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

    const showPrices = await canViewPrices();

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

    const currentType = typeParam || 'all';

    return (
        <div className="flex flex-col gap-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Product Catalog</h1>
                    <p className="text-muted-foreground mt-1">
                        Manage your raw materials, intermediate goods, and finished products.
                    </p>
                </div>
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
            </div>

            <Tabs defaultValue={currentType} className="w-full">
                <TabsList className="mb-4">
                    <Link href="/dashboard/products"><TabsTrigger value="all">All Items</TabsTrigger></Link>
                    <Link href="/dashboard/products?type=RAW_MATERIAL"><TabsTrigger value="RAW_MATERIAL">Raw Materials</TabsTrigger></Link>
                    <Link href="/dashboard/products?type=INTERMEDIATE"><TabsTrigger value="INTERMEDIATE">Intermediate</TabsTrigger></Link>
                    <Link href="/dashboard/products?type=FINISHED_GOOD"><TabsTrigger value="FINISHED_GOOD">Finished Goods</TabsTrigger></Link>
                    <Link href="/dashboard/products?type=PACKAGING"><TabsTrigger value="PACKAGING">Packaging</TabsTrigger></Link>
                    <Link href="/dashboard/products?type=SCRAP"><TabsTrigger value="SCRAP">Scrap</TabsTrigger></Link>
                </TabsList>

                <Card className="bg-background/40 backdrop-blur-xl border-white/10 dark:border-white/5 overflow-hidden shadow-xl">
                    <CardContent className="p-0">
                        <ProductTable products={serializedProducts} showPrices={showPrices} />
                    </CardContent>
                </Card>
            </Tabs>
        </div>
    );
}
