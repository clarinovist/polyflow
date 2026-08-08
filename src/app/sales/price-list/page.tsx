import { getCustomers } from '@/actions/sales/customer';
import { listPricesByProductAction } from '@/actions/sales/price-list';
import { PageHeader } from '@/components/ui/page-header';
import { serializeData } from '@/lib/utils/utils';
import { PriceListClient } from '@/components/sales/price-list/PriceListClient';
import { prisma } from '@/lib/core/prisma';
import { requireSalesAccess } from '@/lib/auth/sales-access';
import { withTenant } from '@/lib/core/tenant';

// Inline load to keep page self-contained; getProductVariants not reused for list

async function getProductsForFilter() {
    const products = await prisma.productVariant.findMany({
        where: {
            product: { productType: { in: ['FINISHED_GOOD', 'PACKAGING'] } },
        },
        select: {
            id: true,
            name: true,
            skuCode: true,
            product: { select: { name: true, productType: true } },
        },
        orderBy: [{ product: { name: 'asc' } }, { name: 'asc' }],
        take: 500,
    });
    return products;
}

export default async function PriceListPage() {
    // Ensure auth guard runs in page (also enforced in actions)
    const Wrapped = withTenant(async function Wrapped() {
        await requireSalesAccess();
        const [customersRes, pricesRes, products] = await Promise.all([
            getCustomers(),
            listPricesByProductAction({
                page: 1,
                pageSize: 50,
            }),
            getProductsForFilter(),
        ]);

        const customers =
            customersRes.success && customersRes.data
                ? (
                      customersRes.data as {
                          id: string;
                          name: string;
                          code: string | null;
                      }[]
                  ).map((c) => ({
                      id: c.id,
                      name: c.name,
                      code: c.code,
                  }))
                : [];

        const priceResult =
            pricesRes.success && pricesRes.data
                ? (pricesRes.data as {
                      data: unknown[];
                      total: number;
                      page: number;
                      pageSize: number;
                      totalPages: number;
                  })
                : { data: [], total: 0, page: 1, pageSize: 50, totalPages: 1 };

        return {
            customers,
            prices: serializeData(priceResult),
            products: serializeData(products),
        };
    });

    const result = await Wrapped();
    type Payload = {
        customers: { id: string; name: string; code: string | null }[];
        prices: {
            data: unknown[];
            total: number;
            page: number;
            pageSize: number;
            totalPages: number;
        };
        products: {
            id: string;
            name: string;
            skuCode: string;
            product: { name: string; productType: string };
        }[];
    };
    const payload: Payload =
        result &&
        typeof result === 'object' &&
        'customers' in (result as Record<string, unknown>)
            ? (result as unknown as Payload)
            : {
                  customers: [],
                  prices: {
                      data: [],
                      total: 0,
                      page: 1,
                      pageSize: 50,
                      totalPages: 1,
                  },
                  products: [],
              };

    return (
        <div className="flex flex-col space-y-6 p-6">
            <PageHeader
                title="Price List"
                description="Harga khusus per customer & produk. Perubahan massal wajib preview dulu (tidak ada undo)."
            />
            <PriceListClient
                initialPrices={payload.prices as never}
                customers={payload.customers}
                products={payload.products as never}
            />
        </div>
    );
}
