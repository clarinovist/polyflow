import { getCustomers, deleteCustomer } from '@/actions/customer';
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
import { Users, Phone, MapPin, Eye } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Customer } from '@prisma/client';

export default async function CustomersPage() {
    const customers = await getCustomers();

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Customers</h1>
                    <p className="text-muted-foreground">
                        Manage your customers and sales channels
                    </p>
                </div>
                <CustomerDialog mode="create" />
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        All Customers
                    </CardTitle>
                    <CardDescription>
                        List of active customers in the system.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Code</TableHead>
                                <TableHead>Name</TableHead>
                                <TableHead>Phone</TableHead>
                                <TableHead>Billing Address</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="w-[120px] text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {customers.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                        No customers found. Add your first customer!
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
                                                {customer.isActive ? 'Active' : 'Inactive'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <Link href={`/dashboard/customers/${customer.id}`}>
                                                    <Button variant="ghost" size="icon">
                                                        <Eye className="h-4 w-4" />
                                                    </Button>
                                                </Link>
                                                <CustomerDialog mode="edit" initialData={customer} />
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
