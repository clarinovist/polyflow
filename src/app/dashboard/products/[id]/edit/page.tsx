import { getProductById, getProductTypes, getUnits } from '@/actions/product';
import { ProductForm } from '@/components/products/ProductForm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { notFound } from 'next/navigation';
import { UpdateProductValues } from '@/lib/zod-schemas';
import { Product, ProductVariant } from '@prisma/client';

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

    const productData = product as unknown as Product & { variants: ProductVariant[] };

    // Transform product data to match form values
    const formData: UpdateProductValues = {
        id: productData.id,
        name: productData.name,
        productType: productData.productType,
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
        })),
    };

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
                    />
                </CardContent>
            </Card>
        </div>
    );
}
