import { getSuppliers, deleteSupplier } from '@/actions/purchasing/supplier';
import { SupplierDialog } from '@/components/planning/suppliers/SupplierDialog';
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
import { purchasingLabels, formLabels } from '@/lib/labels';

export default async function SuppliersPage() {
    const suppliersRes = await getSuppliers();
    const suppliers = suppliersRes.success && suppliersRes.data ? suppliersRes.data : [];

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Supplier</h1>
                    <p className="text-muted-foreground">
                        Kelola penyedia bahan baku dan jasa Anda
                    </p>
                </div>
                <SupplierDialog mode="create" />
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Truck className="h-5 w-5" />
                        Semua Supplier
                    </CardTitle>
                    <CardDescription>
                        Daftar supplier aktif di sistem.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{purchasingLabels.supplierCode}</TableHead>
                                <TableHead>{formLabels.name}</TableHead>
                                <TableHead>{formLabels.phone}</TableHead>
                                <TableHead>{formLabels.address}</TableHead>
                                <TableHead>{formLabels.status}</TableHead>
                                <TableHead className="w-[120px] text-right">Aksi</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {suppliers.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                        {purchasingLabels.emptySuppliers} Tambahkan supplier pertama Anda!
                                    </TableCell>
                                </TableRow>
                            ) : (
                                suppliers.map((supplier: Supplier) => (
                                    <TableRow key={supplier.id}>
                                        <TableCell className="font-medium text-muted-foreground font-mono text-xs">
                                            {supplier.code || '-'}
                                        </TableCell>
                                        <TableCell className="font-medium">
                                            <div>{supplier.name}</div>
                                            <div className="flex items-center gap-1 mt-1">
                                                <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-emerald-200 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20">
                                                    Terpercaya
                                                </Badge>
                                            </div>
                                        </TableCell>
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
                                                {supplier.isActive ? 'Aktif' : 'Nonaktif'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <Link href={`/planning/suppliers/${supplier.id}`}>
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
