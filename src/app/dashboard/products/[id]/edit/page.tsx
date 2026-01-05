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

    // Transform product data to match form values
    const formData: UpdateProductValues = {
        id: product.id,
        name: product.name,
        productType: product.productType,
        variants: product.variants.map((variant) => ({
            id: variant.id,
            name: variant.name,
            skuCode: variant.skuCode,
            primaryUnit: variant.primaryUnit,
            salesUnit: variant.salesUnit,
            conversionFactor: variant.conversionFactor.toNumber(),
            price: variant.price?.toNumber() || null,
            buyPrice: variant.buyPrice?.toNumber() || null,
            sellPrice: variant.sellPrice?.toNumber() || null,
            minStockAlert: variant.minStockAlert?.toNumber() || null,
        })),
    };

    return (
        <div className="container mx-auto py-8">
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
