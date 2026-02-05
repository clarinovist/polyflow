import { getSupplierById } from '@/actions/supplier';
import { getSupplierProducts } from '@/actions/supplier-product';
import { notFound } from 'next/navigation';
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
import { Button } from '@/components/ui/button';
import { ChevronLeft, Phone, MapPin, Package, Clock, DollarSign, Star, Building2, CreditCard, Mail } from 'lucide-react';
import Link from 'next/link';
import { LinkProductDialog } from '@/components/planning/suppliers/LinkProductDialog';
import { UnlinkProductButton } from '@/components/planning/suppliers/UnlinkProductButton';
// Note: UnlinkProductButton is still in contacts folder, I should move it too.

interface SupplierProduct {
    id: string;
    isPreferred: boolean;
    unitPrice: number | null;
    leadTimeDays: number | null;
    minOrderQty: number | null;
    productVariant: {
        name: string;
        skuCode: string;
        product: {
            name: string;
        };
    };
}

export default async function SupplierDetailPage(props: { params: Promise<{ id: string }> }) {
    const { id } = await props.params;

    const supplier = await getSupplierById(id);
    if (!supplier) {
        notFound();
    }

    const supplierProducts = await getSupplierProducts(id) as unknown as SupplierProduct[];

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/planning/suppliers">
                    <Button variant="outline" size="icon">
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{supplier.name}</h1>
                    <div className="flex gap-2 mt-1">
                        <Badge variant="outline">
                            {supplier.code || 'No Code'}
                        </Badge>
                        <Badge variant={supplier.isActive ? 'default' : 'secondary'}>
                            {supplier.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Contact Info Card */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Building2 className="h-5 w-5" />
                            Overview
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {supplier.email && (
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
                                    <Mail className="h-4 w-4 text-muted-foreground" />
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Email</p>
                                    <p className="font-medium text-sm break-all">{supplier.email}</p>
                                </div>
                            </div>
                        )}
                        {supplier.phone && (
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
                                    <Phone className="h-4 w-4 text-muted-foreground" />
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Phone</p>
                                    <p className="font-medium">{supplier.phone}</p>
                                </div>
                            </div>
                        )}
                        {supplier.address && (
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
                                    <MapPin className="h-4 w-4 text-muted-foreground" />
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Address</p>
                                    <p className="font-medium text-sm">{supplier.address}</p>
                                </div>
                            </div>
                        )}
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
                                <p className="font-medium">{supplier.taxId || '-'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">Payment Terms</p>
                                <p className="font-medium">{supplier.paymentTermDays ? `${supplier.paymentTermDays} Days` : '-'}</p>
                            </div>
                        </div>
                        <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
                            <p className="text-xs text-muted-foreground mb-1">Bank Information</p>
                            <div className="text-sm">
                                {supplier.bankName ? (
                                    <div className="font-medium">
                                        {supplier.bankName}
                                        {supplier.bankAccount && <span className="text-muted-foreground font-mono ml-2">{supplier.bankAccount}</span>}
                                    </div>
                                ) : '-'}
                            </div>
                        </div>
                        {supplier.notes && (
                            <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
                                <p className="text-xs text-muted-foreground mb-1">Notes</p>
                                <p className="text-sm italic">{supplier.notes}</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Statistics Card */}
                <Card>
                    <CardHeader>
                        <CardTitle>Supplied Items</CardTitle>
                    </CardHeader>
                    <CardContent className="flex items-center justify-center py-6">
                        <div className="text-center">
                            <p className="text-4xl font-bold">{supplierProducts.length}</p>
                            <p className="text-sm text-muted-foreground">Active Products</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Products Table */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <Package className="h-5 w-5" />
                            Products Supplied
                        </CardTitle>
                        <CardDescription>
                            List of product variants this supplier provides.
                        </CardDescription>
                    </div>
                    <LinkProductDialog supplierId={id} supplierName={supplier.name} />
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Product / Variant</TableHead>
                                <TableHead>SKU</TableHead>
                                <TableHead>Price</TableHead>
                                <TableHead>Lead Time</TableHead>
                                <TableHead>Min Order</TableHead>
                                <TableHead className="w-[100px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {supplierProducts.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                        No products linked to this supplier yet.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                (supplierProducts as unknown as SupplierProduct[]).map((sp) => (
                                    <TableRow key={sp.id}>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-medium flex items-center gap-1">
                                                    {sp.productVariant.product.name}
                                                    {sp.isPreferred && <Star className="h-3 w-3 fill-yellow-400 text-yellow-500" />}
                                                </span>
                                                <span className="text-xs text-muted-foreground">{sp.productVariant.name}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="font-mono text-xs">{sp.productVariant.skuCode}</TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-1">
                                                <DollarSign className="h-3 w-3 text-muted-foreground" />
                                                {sp.unitPrice ? sp.unitPrice.toString() : '-'}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-1">
                                                <Clock className="h-3 w-3 text-muted-foreground" />
                                                {sp.leadTimeDays ? `${sp.leadTimeDays} days` : '-'}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {sp.minOrderQty ? sp.minOrderQty.toString() : '-'}
                                        </TableCell>
                                        <TableCell>
                                            <UnlinkProductButton id={sp.id} />
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
