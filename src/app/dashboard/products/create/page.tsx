import { getProductTypes, getUnits } from '@/actions/product';
import { getAccounts } from '@/actions/finance/account-actions';
import { ProductForm } from '@/components/products/ProductForm';
import { ProductGlossary } from '@/components/products/ProductGlossary';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function CreateProductPage() {
    const [productTypesRes, unitsRes, accountsRes] = await Promise.all([
        getProductTypes(),
        getUnits(),
        getAccounts(),
    ]);

    const productTypes = productTypesRes.success && productTypesRes.data ? productTypesRes.data : [];
    const units = unitsRes.success && unitsRes.data ? unitsRes.data : [];
    const allAccounts = accountsRes.success && Array.isArray(accountsRes.data) ? (accountsRes.data as { id: string; code: string; name: string; type: string; category: string }[]) : [];
    const fixedAssetAccounts = allAccounts.filter((a) => a.type === 'ASSET' && a.category === 'FIXED_ASSET').map((a) => ({ id: a.id, code: a.code, name: a.name }));

    return (
        <div className="p-6">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Buat Produk Baru</CardTitle>
                    <ProductGlossary />
                </CardHeader>
                <CardContent>
                    <ProductForm
                        mode="create"
                        productTypes={productTypes}
                        units={units}
                        fixedAssetAccounts={fixedAssetAccounts}
                    />
                </CardContent>
            </Card>
        </div>
    );
}
