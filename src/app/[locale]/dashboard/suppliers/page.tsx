import { getSuppliers, deleteSupplier } from '@/actions/supplier';
import { SupplierDialog } from '@/components/suppliers/SupplierDialog';
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
import { Truck, Phone, MapPin, Eye } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Supplier } from '@prisma/client';

export default async function SuppliersPage() {
    const suppliers = await getSuppliers();

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Suppliers</h1>
                    <p className="text-muted-foreground">
                        Manage your raw material and service providers
                    </p>
                </div>
                <SupplierDialog mode="create" />
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Truck className="h-5 w-5" />
                        All Suppliers
                    </CardTitle>
                    <CardDescription>
                        List of active suppliers in the system.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Code</TableHead>
                                <TableHead>Name</TableHead>
                                <TableHead>Phone</TableHead>
                                <TableHead>Address</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="w-[120px] text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {suppliers.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                        No suppliers found. Add your first supplier!
                                    </TableCell>
                                </TableRow>
                            ) : (
                                suppliers.map((supplier: Supplier) => (
                                    <TableRow key={supplier.id}>
                                        <TableCell className="font-medium text-muted-foreground font-mono text-xs">
                                            {supplier.code || '-'}
                                        </TableCell>
                                        <TableCell className="font-medium">{supplier.name}</TableCell>
                                        <TableCell>
                                            {supplier.phone ? (
                                                <div className="flex items-center gap-2">
                                                    <Phone className="h-3 w-3 text-muted-foreground" />
                                                    {supplier.phone}
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground text-sm italic">-</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="max-w-[300px] truncate">
                                            {supplier.address ? (
                                                <div className="flex items-center gap-2" title={supplier.address}>
                                                    <MapPin className="h-3 w-3 text-muted-foreground" />
                                                    {supplier.address}
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground text-sm italic">-</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={supplier.isActive ? 'default' : 'secondary'}>
                                                {supplier.isActive ? 'Active' : 'Inactive'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <Link href={`/dashboard/suppliers/${supplier.id}`}>
                                                    <Button variant="ghost" size="icon">
                                                        <Eye className="h-4 w-4" />
                                                    </Button>
                                                </Link>
                                                <SupplierDialog mode="edit" initialData={supplier} />
                                                <DeleteButton
                                                    id={supplier.id}
                                                    onDelete={deleteSupplier}
                                                    entityName="Supplier"
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
