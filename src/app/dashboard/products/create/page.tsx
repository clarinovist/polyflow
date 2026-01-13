import { getProductTypes, getUnits } from '@/actions/product';
import { ProductForm } from '@/components/products/ProductForm';
import { ProductGlossary } from '@/components/products/ProductGlossary';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function CreateProductPage() {
    const [productTypes, units] = await Promise.all([
        getProductTypes(),
        getUnits(),
    ]);

    return (
        <div className="p-6">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Create New Product</CardTitle>
                    <ProductGlossary />
                </CardHeader>
                <CardContent>
                    <ProductForm
                        mode="create"
                        productTypes={productTypes}
                        units={units}
                    />
                </CardContent>
            </Card>
        </div>
    );
}
