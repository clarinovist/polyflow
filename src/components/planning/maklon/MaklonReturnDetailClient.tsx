'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { MaklonMaterialReturnStatus } from '@prisma/client';

export function MaklonReturnDetailClient({ 
    ret 
}: { 
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ret: any 
}) {
    const getStatusColor = (status: MaklonMaterialReturnStatus) => {
        switch (status) {
            case 'DRAFT': return 'bg-slate-100 text-slate-800 border-slate-200';
            case 'CONFIRMED': return 'bg-blue-100 text-blue-800 border-blue-200';
            case 'COMPLETED': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
            case 'CANCELLED': return 'bg-red-100 text-red-800 border-red-200';
            default: return 'bg-slate-100 text-slate-800';
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <div>
                    <Button variant="ghost" asChild className="mb-2 -ml-4">
                        <Link href="/dashboard/maklon/returns">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Back to Maklon Returns
                        </Link>
                    </Button>
                    <div className="flex items-center gap-3">
                        <h1 className="text-3xl font-bold tracking-tight">{ret.returnNumber}</h1>
                        <Badge className={getStatusColor(ret.status)} variant="secondary">
                            {ret.status.replace(/_/g, ' ')}
                        </Badge>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Return Information</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-sm text-muted-foreground">Return Date</p>
                                <p className="font-medium">{format(new Date(ret.returnDate), 'PPP')}</p>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Customer</p>
                                <p className="font-medium">{ret.customer?.name || '-'}</p>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Location Dispatch</p>
                                <p className="font-medium">{ret.sourceLocation?.name || '-'}</p>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Returned By</p>
                                <p className="font-medium">{ret.createdBy?.name || '-'}</p>
                            </div>
                            <div className="col-span-2">
                                <p className="text-sm text-muted-foreground">Reason</p>
                                <p className="font-medium">{ret.reason || '-'}</p>
                            </div>
                            <div className="col-span-2">
                                <p className="text-sm text-muted-foreground">Notes</p>
                                <p className="font-medium">{ret.notes || '-'}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Returned Materials</CardTitle>
                </CardHeader>
                <CardContent className="p-0 sm:p-6 sm:pt-0">
                    <ResponsiveTable minWidth={600}>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>SKU</TableHead>
                                    <TableHead>Product Name</TableHead>
                                    <TableHead className="text-right">Quantity returned</TableHead>
                                    <TableHead>Notes</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                {ret.items.map((item: any) => (
                                    <TableRow key={item.id}>
                                        <TableCell className="font-medium">{item.productVariant?.skuCode}</TableCell>
                                        <TableCell>{item.productVariant?.product?.name}</TableCell>
                                        <TableCell className="text-right">{item.quantity} {item.productVariant?.product?.uom}</TableCell>
                                        <TableCell>{item.notes || '-'}</TableCell>
                                    </TableRow>
                                ))}
                                {ret.items.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center h-24 text-muted-foreground">
                                            No materials recorded.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </ResponsiveTable>
                </CardContent>
            </Card>
        </div>
    );
}
