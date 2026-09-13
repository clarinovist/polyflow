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
    const validType = Object.values(ProductType).includes(
        typeParam as ProductType,
    )
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
        <div className="flex min-w-0 max-w-full flex-col gap-8">
            <div className="flex min-w-0 flex-col justify-between gap-4 md:flex-row md:items-center">
                <div className="min-w-0">
                    <h1 className="text-3xl font-bold tracking-tight">
                        Katalog Produk
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Kelola bahan baku, barang setengah jadi, dan barang
                        jadi.
                    </p>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Link
                        className="max-w-full"
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
                    <Link
                        href="/dashboard/products/create"
                        className="max-w-full"
                    >
                        <Button>
                            <Plus className="h-4 w-4 mr-2" />
                            Buat Produk
                        </Button>
                    </Link>
                </div>
            </div>

            <Tabs defaultValue={currentType} className="min-w-0 max-w-full">
                <div
                    role="region"
                    aria-label="Filter tipe produk"
                    tabIndex={0}
                    className="mb-4 max-w-full overflow-x-auto pb-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                    <TabsList className="mb-0 w-max min-w-full justify-start">
                        <TabsTrigger value="all" asChild>
                            <Link href="/dashboard/products">Semua Item</Link>
                        </TabsTrigger>
                        <TabsTrigger value="RAW_MATERIAL" asChild>
                            <Link href="/dashboard/products?type=RAW_MATERIAL">
                                Bahan Baku
                            </Link>
                        </TabsTrigger>
                        <TabsTrigger value="INTERMEDIATE" asChild>
                            <Link href="/dashboard/products?type=INTERMEDIATE">
                                Barang Setengah Jadi
                            </Link>
                        </TabsTrigger>
                        <TabsTrigger value="FINISHED_GOOD" asChild>
                            <Link href="/dashboard/products?type=FINISHED_GOOD">
                                Barang Jadi
                            </Link>
                        </TabsTrigger>
                        <TabsTrigger value="PACKAGING" asChild>
                            <Link href="/dashboard/products?type=PACKAGING">
                                Kemasan
                            </Link>
                        </TabsTrigger>
                        <TabsTrigger value="AUXILIARY" asChild>
                            <Link href="/dashboard/products?type=AUXILIARY">
                                Bahan Penolong
                            </Link>
                        </TabsTrigger>
                        <TabsTrigger value="SCRAP" asChild>
                            <Link href="/dashboard/products?type=SCRAP">
                                Scrap
                            </Link>
                        </TabsTrigger>
                    </TabsList>
                </div>

                <Card className="min-w-0 max-w-full overflow-hidden border-white/10 bg-background/40 shadow-xl backdrop-blur-xl dark:border-white/5">
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
