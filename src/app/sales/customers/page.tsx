import { getCustomers, deleteCustomer } from '@/actions/sales/customer';
import { CustomerDialog } from '@/components/customers/CustomerDialog';
import { DeleteButton } from '@/components/common/DeleteButton';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Users, Phone, MapPin, Eye, Plus } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Customer } from '@prisma/client';
import { salesLabels } from '@/lib/labels';

export default async function CustomersPage() {
    const customersRes = await getCustomers();
    const customers = customersRes.success && customersRes.data ? customersRes.data : [];

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{salesLabels.customers}</h1>
                    <p className="text-muted-foreground">
                        {salesLabels.customersDesc}
                    </p>
                </div>
                <CustomerDialog mode="create" />
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        {salesLabels.allCustomers}
                    </CardTitle>
                    <CardDescription>
                        {salesLabels.allCustomersDesc}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{salesLabels.code}</TableHead>
                                <TableHead>{salesLabels.name}</TableHead>
                                <TableHead>{salesLabels.phone}</TableHead>
                                <TableHead>{salesLabels.billingAddress}</TableHead>
                                <TableHead>{salesLabels.status}</TableHead>
                                <TableHead className="w-[120px] text-right">{salesLabels.actions}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {customers.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-96 text-center">
                                        <div className="flex flex-col items-center justify-center space-y-3">
                                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                                                <Users className="h-6 w-6 text-muted-foreground" />
                                            </div>
                                            <div className="space-y-1">
                                                <h3 className="text-lg font-medium">Tidak ada pelanggan ditemukan</h3>
                                                <p className="text-muted-foreground">
                                                    Mulai dengan membuat pelanggan baru.
                                                </p>
                                            </div>
                                            <CustomerDialog
                                                mode="create"
                                                trigger={
                                                    <Button variant="outline" className="mt-4">
                                                        <Plus className="mr-2 h-4 w-4" />
                                                        {salesLabels.addCustomer}
                                                    </Button>
                                                }
                                            />
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                customers.map((customer: Customer) => (
                                    <TableRow key={customer.id}>
                                        <TableCell className="font-medium text-muted-foreground font-mono text-xs">
                                            {customer.code || '-'}
                                        </TableCell>
                                        <TableCell className="font-medium">{customer.name}</TableCell>
                                        <TableCell>
                                            {customer.phone ? (
                                                <div className="flex items-center gap-2">
                                                    <Phone className="h-3 w-3 text-muted-foreground" />
                                                    {customer.phone}
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground text-sm italic">-</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="max-w-[300px] truncate">
                                            {customer.billingAddress ? (
                                                <div className="flex items-center gap-2" title={customer.billingAddress}>
                                                    <MapPin className="h-3 w-3 text-muted-foreground" />
                                                    {customer.billingAddress}
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground text-sm italic">-</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={customer.isActive ? 'default' : 'secondary'}>
                                                {customer.isActive ? salesLabels.active : salesLabels.inactive}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <Link href={`/sales/customers/${customer.id}`}>
                                                    <Button variant="ghost" size="icon">
                                                        <Eye className="h-4 w-4" />
                                                    </Button>
                                                </Link>
                                                <CustomerDialog mode="edit" initialData={{
                                                    ...customer,
                                                    creditLimit: customer.creditLimit ? Number(customer.creditLimit) : null,
                                                    discountPercent: customer.discountPercent ? Number(customer.discountPercent) : null
                                                }} />
                                                <DeleteButton
                                                    id={customer.id}
                                                    onDelete={deleteCustomer}
                                                    entityName="Customer"
                                                />
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
