import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TopProductItem, TopCustomerItem } from '@/types/analytics';
import { formatRupiah } from '@/lib/utils/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

interface TopProductsListProps {
    data: TopProductItem[];
}

export function TopProductsList({ data }: TopProductsListProps) {
    return (
        <Card className="col-span-3">
            <CardHeader>
                <CardTitle>Produk Terlaris</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-8">
                    {data.map((product, i) => (
                        <div key={i} className="flex items-center">
                            <div className="space-y-1">
                                <p className="text-sm font-medium leading-none">{product.productName}</p>
                                <p className="text-sm text-muted-foreground">
                                    {product.totalQuantity} terjual
                                </p>
                            </div>
                            <div className="ml-auto font-medium">{formatRupiah(product.totalRevenue)}</div>
                        </div>
                    ))}
                    {data.length === 0 && (
                        <p className="text-sm text-muted-foreground">Belum ada penjualan.</p>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

interface TopCustomersListProps {
    data: TopCustomerItem[];
}

export function TopCustomersList({ data }: TopCustomersListProps) {
    return (
        <Card className="col-span-3">
            <CardHeader>
                <CardTitle>Pelanggan Teratas</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-8">
                    {data.map((customer, i) => (
                        <div key={i} className="flex items-center">
                            <Avatar className="h-9 w-9">
                                <AvatarFallback>{customer.customerName.substring(0, 2).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <div className="ml-4 space-y-1">
                                <p className="text-sm font-medium leading-none">{customer.customerName}</p>
                                <p className="text-sm text-muted-foreground">
                                    {customer.orderCount} pesanan
                                </p>
                            </div>
                            <div className="ml-auto font-medium">{formatRupiah(customer.totalSpent)}</div>
                        </div>
                    ))}
                    {data.length === 0 && (
                        <p className="text-sm text-muted-foreground">Belum ada pelanggan.</p>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
