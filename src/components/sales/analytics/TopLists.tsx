import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SalesMetrics } from '@/actions/analytics';
import { formatRupiah } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

interface TopListProps {
    data: SalesMetrics;
}

export function TopProductsList({ data }: TopListProps) {
    return (
        <Card className="col-span-3">
            <CardHeader>
                <CardTitle>Top Products</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-8">
                    {data.topProducts.map((product, i) => (
                        <div key={i} className="flex items-center">
                            <div className="space-y-1">
                                <p className="text-sm font-medium leading-none">{product.name}</p>
                                <p className="text-sm text-muted-foreground">
                                    {product.quantity} sold
                                </p>
                            </div>
                            <div className="ml-auto font-medium">{formatRupiah(product.revenue)}</div>
                        </div>
                    ))}
                    {data.topProducts.length === 0 && (
                        <p className="text-sm text-muted-foreground">No sales yet.</p>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

export function TopCustomersList({ data }: TopListProps) {
    return (
        <Card className="col-span-3">
            <CardHeader>
                <CardTitle>Top Customers</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-8">
                    {data.topCustomers.map((customer, i) => (
                        <div key={i} className="flex items-center">
                            <Avatar className="h-9 w-9">
                                <AvatarFallback>{customer.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <div className="ml-4 space-y-1">
                                <p className="text-sm font-medium leading-none">{customer.name}</p>
                                <p className="text-sm text-muted-foreground">
                                    {customer.salesCount} orders
                                </p>
                            </div>
                            <div className="ml-auto font-medium">{formatRupiah(customer.revenue)}</div>
                        </div>
                    ))}
                    {data.topCustomers.length === 0 && (
                        <p className="text-sm text-muted-foreground">No customers yet.</p>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
