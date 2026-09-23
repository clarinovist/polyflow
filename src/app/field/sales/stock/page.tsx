import { getProductVariants } from '@/actions/inventory/inventory';
import { getLocations } from '@/actions/inventory/inventory';
import { StockCheckClient } from './StockCheckClient';
import { MobileReadError } from '@/components/mobile/MobileReadError';

export default async function SalesMobileStockPage() {
    const [productsRes, locationsRes] = await Promise.all([
        getProductVariants(),
        getLocations(),
    ]);

    if (!productsRes.success || !locationsRes.success) return <MobileReadError title="Data stok belum tersedia" />;
    const products = productsRes.data;
    const locations = locationsRes.data;
    const visibleLocationIds = new Set(locations.filter((location) =>
        location.locationType !== 'CUSTOMER_OWNED' &&
        ['FINISHED_GOOD', 'PACKING', 'GENERAL_PURPOSE', 'RAW_MATERIAL', 'SCRAP'].includes(location.locationPurpose),
    ).map((location) => location.id));

    const serializedProducts = products
        .filter(
            (p) =>
                p.product.productType === 'FINISHED_GOOD' ||
                p.product.productType === 'PACKAGING',
        )
        .map((p) => ({
            id: p.id,
            name: p.name,
            productName: p.product.name,
            skuCode: p.skuCode,
            primaryUnit: p.primaryUnit,
            sellPrice: p.sellPrice ? Number(p.sellPrice) : null,
            inventories:
                p.inventories?.filter((inv) => visibleLocationIds.has(inv.locationId)).map((inv) => ({
                    locationId: inv.locationId,
                    quantity: Number(inv.quantity),
                })) || [],
        }));

    const stockLocations = locations
        .filter((l) => visibleLocationIds.has(l.id))
        .map((l) => ({ id: l.id, name: l.name }));

    return (
        <StockCheckClient
            products={serializedProducts}
            locations={stockLocations}
        />
    );
}
