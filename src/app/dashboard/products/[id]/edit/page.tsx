import { getProductById, getProductTypes, getUnits } from '@/actions/product';
import { getAccounts } from '@/actions/finance/account-actions';
import { ProductForm } from '@/components/products/ProductForm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { notFound } from 'next/navigation';
import { UpdateProductValues, ProductVariantFormValues } from '@/lib/schemas/product';
import { Product, ProductVariant } from '@prisma/client';

const CONSUMPTION_RULES = new Set<ProductVariantFormValues['consumptionRule']>([
    'PROPORTIONAL',
    'FLOOR_ENTERED_BAL',
    'CEIL_ENTERED_BAL',
    null,
    undefined,
]);

function resolveConsumptionRule(attributes: unknown): ProductVariantFormValues['consumptionRule'] {
    if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) {
        return 'PROPORTIONAL';
    }
    const rule = (attributes as Record<string, unknown>).consumptionRule;
    return CONSUMPTION_RULES.has(rule as ProductVariantFormValues['consumptionRule'])
        ? (rule as ProductVariantFormValues['consumptionRule']) ?? 'PROPORTIONAL'
        : 'PROPORTIONAL';
}

type ProductWithExtra = Product & { variants: (ProductVariant & { attributes?: { usefulLifeMonths?: number; consumptionRule?: string } | null })[]; assetCategory?: string | null; inventoryAccountId?: string | null };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    const [productRes, productTypesRes, unitsRes, accountsRes] = await Promise.all([
        getProductById(id),
        getProductTypes(),
        getUnits(),
        getAccounts(),
    ]);

    const productTypes = productTypesRes.success && productTypesRes.data ? productTypesRes.data : [];
    const units = unitsRes.success && unitsRes.data ? unitsRes.data : [];
    const allAccounts = accountsRes.success && Array.isArray(accountsRes.data) ? (accountsRes.data as { id: string; code: string; name: string; type: string; category: string }[]) : [];
    const fixedAssetAccounts = allAccounts.filter((a) => a.type === 'ASSET' && a.category === 'FIXED_ASSET').map((a) => ({ id: a.id, code: a.code, name: a.name }));

    if (!productRes.success || !productRes.data) {
        notFound();
    }

    const productData = productRes.data as unknown as ProductWithExtra;

    const firstVariantUseful = (productData.variants[0]?.attributes as { usefulLifeMonths?: number } | null)?.usefulLifeMonths;
    const formData = {
        id: productData.id,
        name: productData.name,
        productType: productData.productType,
        assetCategory: productData.assetCategory || null,
        inventoryAccountId: productData.inventoryAccountId || null,
        usefulLifeMonths: firstVariantUseful ? Number(firstVariantUseful) : 60,
        variants: productData.variants.map((variant) => ({
            id: variant.id,
            name: variant.name,
            skuCode: variant.skuCode,
            primaryUnit: variant.primaryUnit,
            salesUnit: variant.salesUnit,
            conversionFactor: Number(variant.conversionFactor),
            price: variant.price ? Number(variant.price) : null,
            buyPrice: variant.buyPrice ? Number(variant.buyPrice) : null,
            sellPrice: variant.sellPrice ? Number(variant.sellPrice) : null,
            minStockAlert: variant.minStockAlert ? Number(variant.minStockAlert) : null,
            consumptionRule: resolveConsumptionRule(variant.attributes),
        })),
    } as unknown as UpdateProductValues;

    return (
        <div className="p-6">
            <Card>
                <CardHeader>
                    <CardTitle>Edit Product: {productData.name}</CardTitle>
                </CardHeader>
                <CardContent>
                    <ProductForm
                        mode="edit"
                        productTypes={productTypes}
                        units={units}
                        initialData={formData}
                        fixedAssetAccounts={fixedAssetAccounts}
                    />
                </CardContent>
            </Card>
        </div>
    );
}
