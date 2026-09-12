import { getProductCatalogPage } from '@/actions/product';
import { canViewPrices } from '@/actions/admin/permissions';
import { ProductTable } from '@/components/products/ProductTable';
import { ProductGlossary } from '@/components/products/ProductGlossary';
import { ImportDialog } from '@/components/products/ImportDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { ProductType } from '@prisma/client';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { productTableLabels } from '@/lib/labels/products';
import {
    PRODUCT_CATALOG_SORT_KEYS,
    type ProductCatalogSortDirection,
    type ProductCatalogSortKey,
} from '@/actions/product/product-catalog-types';

type ProductsSearchParams = {
    type?: string | string[];
    archived?: string | string[];
    q?: string | string[];
    page?: string | string[];
    pageSize?: string | string[];
    sort?: string | string[];
    direction?: string | string[];
};

function firstParam(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value;
}

export default async function ProductsPage({
    searchParams,
}: {
    searchParams: Promise<ProductsSearchParams>;
}) {
    const params = await searchParams;
    const typeParam = firstParam(params.type);
    const validType = Object.values(ProductType).includes(typeParam as ProductType)
        ? (typeParam as ProductType)
        : undefined;
    const sortParam = firstParam(params.sort);
    const sort = PRODUCT_CATALOG_SORT_KEYS.includes(
        sortParam as ProductCatalogSortKey,
    )
        ? (sortParam as ProductCatalogSortKey)
        : undefined;
    const directionParam = firstParam(params.direction);
    const direction: ProductCatalogSortDirection | undefined =
        directionParam === 'asc' || directionParam === 'desc'
            ? directionParam
            : undefined;
    const showArchived = firstParam(params.archived) === '1';

    const catalogResult = await getProductCatalogPage({
        search: firstParam(params.q),
        type: validType,
        includeArchived: showArchived,
        page: Number(firstParam(params.page)),
        pageSize: Number(firstParam(params.pageSize)),
        sort,
        direction,
    });
    if (!catalogResult.success || !catalogResult.data) {
        throw new Error('Gagal memuat katalog produk');
    }

    const showPricesRes = await canViewPrices();
    const showPrices = showPricesRes.success ? showPricesRes.data : false;
    const currentType = validType ?? 'all';

    return (
        <div className="flex flex-col gap-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        Product Catalog
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Manage your raw materials, intermediate goods, and
                        finished products.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Link
                        href={
                            showArchived
                                ? `/dashboard/products${validType ? `?type=${validType}` : ''}`
                                : `/dashboard/products?${validType ? `type=${validType}&` : ''}archived=1`
                        }
                    >
                        <Button variant="outline">
                            {showArchived
                                ? productTableLabels.hideArchived
                                : productTableLabels.showArchived}
                        </Button>
                    </Link>
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
                    <Link href="/dashboard/products">
                        <TabsTrigger value="all">All Items</TabsTrigger>
                    </Link>
                    <Link href="/dashboard/products?type=RAW_MATERIAL">
                        <TabsTrigger value="RAW_MATERIAL">
                            Raw Materials
                        </TabsTrigger>
                    </Link>
                    <Link href="/dashboard/products?type=INTERMEDIATE">
                        <TabsTrigger value="INTERMEDIATE">
                            Intermediate
                        </TabsTrigger>
                    </Link>
                    <Link href="/dashboard/products?type=FINISHED_GOOD">
                        <TabsTrigger value="FINISHED_GOOD">
                            Finished Goods
                        </TabsTrigger>
                    </Link>
                    <Link href="/dashboard/products?type=PACKAGING">
                        <TabsTrigger value="PACKAGING">Packaging</TabsTrigger>
                    </Link>
                    <Link href="/dashboard/products?type=AUXILIARY">
                        <TabsTrigger value="AUXILIARY">
                            Bahan Penolong
                        </TabsTrigger>
                    </Link>
                    <Link href="/dashboard/products?type=SCRAP">
                        <TabsTrigger value="SCRAP">Scrap</TabsTrigger>
                    </Link>
                </TabsList>

                <Card className="bg-background/40 backdrop-blur-xl border-white/10 dark:border-white/5 overflow-hidden shadow-xl">
                    <CardContent className="p-0">
                        <ProductTable
                            catalogPage={catalogResult.data}
                            showPrices={showPrices}
                        />
                    </CardContent>
                </Card>
            </Tabs>
        </div>
    );
}
