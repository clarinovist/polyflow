import { getMyFieldCustomers } from '@/actions/sales/field-actions';
import { getLocations } from '@/actions/inventory/inventory';
import { getProductVariants } from '@/actions/inventory/inventory';
import { QuickOrderWizard } from './QuickOrderWizard';
import { MobileReadError } from '@/components/mobile';
import { serializeFieldUnits } from '@/lib/sales/field-order-units';

export default async function SalesMobileOrderCreatePage(props: {
    searchParams: Promise<{ customer?: string }>;
}) {
    const params = await props.searchParams;
    const [customersRes, locationsRes, productsRes] = await Promise.all([
        getMyFieldCustomers(),
        getLocations(),
        getProductVariants(),
    ]);

    if (!customersRes.success || !locationsRes.success || !productsRes.success) {
        return <MobileReadError title="Form order belum tersedia" />;
    }

    const customers = customersRes.data ?? [];
    const locations = locationsRes.data ?? [];
    const products = productsRes.data ?? [];

    const serializedCustomers = customers.map((c) => ({
        id: c.id,
        name: c.name,
        code: c.code,
        creditLimit: c.creditLimit ? Number(c.creditLimit) : null,
        paymentTermDays: c.paymentTermDays,
    }));

    const hasLocations = locations.length > 0;
    const visibleLocationIds = new Set(
        locations
            .filter(
                (location) =>
                    location.locationType !== 'CUSTOMER_OWNED' &&
                    [
                        'FINISHED_GOOD',
                        'PACKING',
                        'GENERAL_PURPOSE',
                        'RAW_MATERIAL',
                        'SCRAP',
                    ].includes(location.locationPurpose),
            )
            .map((location) => location.id),
    );

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
            sellPrice: p.sellPrice ? Number(p.sellPrice) : null,
            ...serializeFieldUnits(p),
            inventories:
                p.inventories
                    ?.filter((inv) => !hasLocations || visibleLocationIds.has(inv.locationId))
                    .map((inv) => ({
                        locationId: inv.locationId,
                        quantity: Number(inv.quantity),
                    })) || [],
        }));

    const stockLocations = locations
        .filter((l) => visibleLocationIds.has(l.id))
        .map((l) => ({ id: l.id, name: l.name }));

    return (
        <QuickOrderWizard
            customers={serializedCustomers}
            products={serializedProducts}
            locations={stockLocations}
            preselectedCustomerId={params.customer}
        />
    );
}
