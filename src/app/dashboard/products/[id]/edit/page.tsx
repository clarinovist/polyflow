import { getProductById, getProductTypes, getUnits } from '@/actions/product';
import { ProductForm } from '@/components/products/ProductForm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { notFound } from 'next/navigation';
import { UpdateProductValues } from '@/lib/zod-schemas';

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    const [product, productTypes, units] = await Promise.all([
        getProductById(id),
        getProductTypes(),
        getUnits(),
    ]);

    if (!product) {
        notFound();
    }

    const productData = product as any;

    // Transform product data to match form values
    const formData: UpdateProductValues = {
        id: productData.id,
        name: productData.name,
        productType: productData.productType,
        variants: productData.variants.map((variant: any) => ({
            id: variant.id,
            name: variant.name,
            skuCode: variant.skuCode,
            primaryUnit: variant.primaryUnit,
            salesUnit: variant.salesUnit,
            conversionFactor: variant.conversionFactor,
            price: variant.price || null,
            buyPrice: variant.buyPrice || null,
            sellPrice: variant.sellPrice || null,
            minStockAlert: variant.minStockAlert || null,
        })),
    };

    return (
        <div className="p-6">
            <Card>
                <CardHeader>
                    <CardTitle>Edit Product: {product.name}</CardTitle>
                </CardHeader>
                <CardContent>
                    <ProductForm
                        mode="edit"
                        productTypes={productTypes}
                        units={units}
                        initialData={formData}
                    />
                </CardContent>
            </Card>
        </div>
    );
}
