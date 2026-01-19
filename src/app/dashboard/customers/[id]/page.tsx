import { getCustomerById } from '@/actions/customer';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronLeft, Phone, MapPin, Building2, CreditCard, Mail, DollarSign, Percent } from 'lucide-react';
import Link from 'next/link';
import { CustomerDialog } from '@/components/customers/CustomerDialog';

export default async function CustomerDetailPage(props: { params: Promise<{ id: string }> }) {
    const { id } = await props.params;

    const customer = await getCustomerById(id);
    if (!customer) {
        notFound();
    }

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/dashboard/customers">
                        <Button variant="outline" size="icon">
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">{customer.name}</h1>
                        <div className="flex gap-2 mt-1">
                            <Badge variant="outline">
                                {customer.code || 'No Code'}
                            </Badge>
                            <Badge variant={customer.isActive ? 'default' : 'secondary'}>
                                {customer.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                        </div>
                    </div>
                </div>
                <CustomerDialog mode="edit" initialData={{
                    ...customer,
                    creditLimit: customer.creditLimit ? Number(customer.creditLimit) : null,
                    discountPercent: customer.discountPercent ? Number(customer.discountPercent) : null
                }} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Contact Info Card */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Building2 className="h-5 w-5" />
                            Overview
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {customer.email && (
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
                                    <Mail className="h-4 w-4 text-muted-foreground" />
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Email</p>
                                    <p className="font-medium text-sm break-all">{customer.email}</p>
                                </div>
                            </div>
                        )}
                        {customer.phone && (
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
                                    <Phone className="h-4 w-4 text-muted-foreground" />
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Phone</p>
                                    <p className="font-medium">{customer.phone}</p>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Addresses Card */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <MapPin className="h-5 w-5" />
                            Addresses
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 first:border-0 first:pt-0">
                            <p className="text-xs text-muted-foreground mb-1">Billing Address</p>
                            <p className="text-sm">{customer.billingAddress || '-'}</p>
                        </div>
                        <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
                            <p className="text-xs text-muted-foreground mb-1">Shipping Address</p>
                            <p className="text-sm">{customer.shippingAddress || '-'}</p>
                        </div>
                    </CardContent>
                </Card>

                {/* Financials & Notes */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <CreditCard className="h-5 w-5" />
                            Financial Details
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-xs text-muted-foreground">Tax ID</p>
                                <p className="font-medium">{customer.taxId || '-'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">Payment Terms</p>
                                <p className="font-medium">{customer.paymentTermDays ? `${customer.paymentTermDays} Days` : '-'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground flex items-center gap-1"><DollarSign className="w-3 h-3" /> Credit Limit</p>
                                <p className="font-medium">{customer.creditLimit ? `$${customer.creditLimit}` : '-'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground flex items-center gap-1"><Percent className="w-3 h-3" /> Discount</p>
                                <p className="font-medium">{customer.discountPercent ? `${customer.discountPercent}%` : '-'}</p>
                            </div>
                        </div>
                        {customer.notes && (
                            <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
                                <p className="text-xs text-muted-foreground mb-1">Notes</p>
                                <p className="text-sm italic">{customer.notes}</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
