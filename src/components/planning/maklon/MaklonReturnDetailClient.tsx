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
import { MAKLON_STAGE_SLUGS } from '@/lib/constants/locations';

type MaklonReturnLocation = {
    id: string;
    name: string;
    slug?: string | null;
};

type MaklonReturnItem = {
    id: string;
    quantity: string | number | { toString(): string };
    notes?: string | null;
    productVariant?: {
        skuCode?: string | null;
        primaryUnit?: string | null;
        product?: {
            name?: string | null;
        } | null;
    } | null;
};

type MaklonReturnDetail = {
    returnNumber: string;
    returnDate: string | Date;
    status: MaklonMaterialReturnStatus;
    reason?: string | null;
    notes?: string | null;
    customer?: { name?: string | null } | null;
    sourceLocation?: MaklonReturnLocation | null;
    createdBy?: { name?: string | null } | null;
    items: MaklonReturnItem[];
};

function getMaklonReturnLocationLabel(location?: MaklonReturnLocation | null) {
    if (!location) return '-';

    switch (location.slug) {
        case MAKLON_STAGE_SLUGS.PACKING:
            return 'Maklon Packing Area';
        case MAKLON_STAGE_SLUGS.FINISHED_GOOD:
            return 'Maklon Finished Goods Storage';
        case MAKLON_STAGE_SLUGS.WIP:
            return 'Maklon WIP Storage';
        case MAKLON_STAGE_SLUGS.RAW_MATERIAL:
            return 'Maklon Raw Material Storage';
        default:
            return location.name;
    }
}

export function MaklonReturnDetailClient({ ret }: { ret: MaklonReturnDetail }) {
    const getStatusColor = (status: MaklonMaterialReturnStatus) => {
        switch (status) {
            case 'DRAFT': return 'bg-muted text-muted-foreground border-border';
            case 'CONFIRMED': return 'bg-primary/10 text-primary border-primary/20';
            case 'COMPLETED': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
            case 'CANCELLED': return 'bg-red-50 text-red-700 border-red-200';
            default: return 'bg-muted text-muted-foreground';
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
                                <p className="text-sm text-muted-foreground">Source Location</p>
                                <p className="font-medium">{getMaklonReturnLocationLabel(ret.sourceLocation)}</p>
                                {ret.sourceLocation?.slug === MAKLON_STAGE_SLUGS.PACKING && (
                                    <p className="text-xs text-muted-foreground">Linked to Maklon Packing Area</p>
                                )}
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
                                {ret.items.map((item) => (
                                    <TableRow key={item.id}>
                                        <TableCell className="font-medium">{item.productVariant?.skuCode}</TableCell>
                                        <TableCell>{item.productVariant?.product?.name}</TableCell>
                                        <TableCell className="text-right">{String(item.quantity)} {item.productVariant?.primaryUnit}</TableCell>
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
