import Link from 'next/link';
import { getCustomers } from '@/actions/sales/customer';
import {
    getLocations,
    getProductVariants,
} from '@/actions/inventory/inventory';
import { getSalesOrders } from '@/actions/sales/sales';
import { SalesReturnForm } from '@/components/sales/SalesReturnForm';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export default async function CreateSalesReturnPage() {
    // Fetch all required lookup data
    const [customersRes, locationsRes, productsRes, salesOrdersRes] =
        await Promise.all([
            getCustomers(),
            getLocations(),
            getProductVariants(),
            getSalesOrders(),
        ]);

    const customers =
        customersRes.success && customersRes.data ? customersRes.data : [];
    const locations =
        locationsRes.success && locationsRes.data ? locationsRes.data : [];
    const products =
        productsRes.success && productsRes.data ? productsRes.data : [];
    const salesOrders =
        salesOrdersRes.success && salesOrdersRes.data
            ? salesOrdersRes.data
            : [];

    return (
        <div className="p-6 max-w-5xl mx-auto">
            <Card>
                <CardHeader>
                    <h1 className="text-lg font-semibold leading-none">
                        Buat Retur Penjualan Baru
                    </h1>
                </CardHeader>
                <CardContent>
                    <p className="mb-6 rounded-md border p-4 text-sm">
                        Ingin langsung menambah stok barang baik dan memotong tagihan SO?{' '}
                        <Link href="/finance/returns/create" className="font-medium underline">Gunakan retur satu langkah (Admin/Finance)</Link>.
                        Form di bawah hanya membuat draft; penerimaan dan kredit diproses terpisah.
                    </p>
                    <SalesReturnForm
                        customers={customers.map((c) => ({
                            ...c,
                            creditLimit: c.creditLimit
                                ? Number(c.creditLimit)
                                : null,
                            discountPercent: c.discountPercent
                                ? Number(c.discountPercent)
                                : null,
                        }))}
                        locations={locations}
                        salesOrders={salesOrders.map((so) => ({
                            ...so,
                            totalAmount: so.totalAmount
                                ? Number(so.totalAmount)
                                : null,
                        }))}
                        products={products.map((p) => ({
                            ...p,
                            price: p.price ? Number(p.price) : null,
                            buyPrice: p.buyPrice ? Number(p.buyPrice) : null,
                            sellPrice: p.sellPrice ? Number(p.sellPrice) : null,
                            conversionFactor: p.conversionFactor
                                ? Number(p.conversionFactor)
                                : 1,
                            standardCost: p.standardCost
                                ? Number(p.standardCost)
                                : null,
                            minStockAlert: p.minStockAlert
                                ? Number(p.minStockAlert)
                                : null,
                            reorderPoint: p.reorderPoint
                                ? Number(p.reorderPoint)
                                : null,
                            reorderQuantity: p.reorderQuantity
                                ? Number(p.reorderQuantity)
                                : null,
                            inventories:
                                p.inventories?.map((inv) => ({
                                    ...inv,
                                    quantity: inv.quantity
                                        ? Number(inv.quantity)
                                        : 0,
                                })) || [],
                        }))}
                        mode="create"
                    />
                </CardContent>
            </Card>
        </div>
    );
}
