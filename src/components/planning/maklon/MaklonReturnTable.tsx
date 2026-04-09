'use client';

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@/components/ui/table';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Customer, MaklonMaterialReturn, MaklonMaterialReturnStatus } from '@prisma/client';
import { RotateCcw, ChevronRight } from 'lucide-react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { useRouter } from 'next/navigation';

type SerializedMaklonReturn = MaklonMaterialReturn & {
    customer: Customer | null;
    _count?: { items: number };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items?: any[];
};

interface MaklonReturnTableProps {
    initialData: SerializedMaklonReturn[];
    basePath?: string;
}

export function MaklonReturnTable({ initialData, basePath = '/dashboard/maklon/returns' }: MaklonReturnTableProps) {
    const router = useRouter();

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
        <div className="rounded-md border-none sm:border">
            {/* Desktop Table View */}
            <div className="hidden md:block">
                <ResponsiveTable minWidth={800}>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Return #</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Customer</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Items</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {initialData.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-24 text-center">
                                        No Maklon returns found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                initialData.map((ret) => {
                                    const itemCount = ret._count?.items ?? ret.items?.length ?? 0;
                                    return (
                                        <TableRow
                                            key={ret.id}
                                            className="cursor-pointer hover:bg-muted/50 transition-colors"
                                            onClick={() => router.push(`${basePath}/${ret.id}`)}
                                        >
                                            <TableCell className="font-medium">
                                                <div className="flex items-center gap-2">
                                                    <RotateCcw className="h-4 w-4 text-muted-foreground" />
                                                    {ret.returnNumber}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {format(new Date(ret.returnDate), 'MMM d, yyyy')}
                                            </TableCell>
                                            <TableCell>
                                                {ret.customer?.name || '-'}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="secondary" className={getStatusColor(ret.status)}>
                                                    {ret.status.replace(/_/g, ' ')}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right text-muted-foreground">
                                                {itemCount}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </ResponsiveTable>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-3">
                {initialData.length === 0 ? (
                    <div className="text-center p-4 text-muted-foreground border rounded-lg border-dashed">
                        No Maklon returns found.
                    </div>
                ) : (
                    initialData.map((ret) => {
                        const itemCount = ret._count?.items ?? ret.items?.length ?? 0;
                        return (
                            <Card
                                key={ret.id}
                                className="overflow-hidden active:scale-[0.99] transition-transform cursor-pointer"
                                onClick={() => router.push(`${basePath}/${ret.id}`)}
                            >
                                <CardHeader className="p-4 pb-2">
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-center gap-2">
                                            <div className="bg-primary/10 p-1.5 rounded-full">
                                                <RotateCcw className="h-4 w-4 text-primary" />
                                            </div>
                                            <div>
                                                <h3 className="font-semibold text-sm">{ret.returnNumber}</h3>
                                                <p className="text-xs text-muted-foreground">{format(new Date(ret.returnDate), 'MMM d, yyyy')}</p>
                                            </div>
                                        </div>
                                        <Badge variant="secondary" className={`text-[10px] px-1.5 h-5 ${getStatusColor(ret.status)}`}>
                                            {ret.status.replace(/_/g, ' ')}
                                        </Badge>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-4 pt-1">
                                    <div className="space-y-3">
                                        <div className="grid grid-cols-2 gap-2 text-sm">
                                            <div>
                                                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Customer</p>
                                                <p className="font-medium truncate">{ret.customer?.name || '-'}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Total Items</p>
                                                <p className="font-semibold text-primary">
                                                    {itemCount}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between pt-2 border-t text-xs text-muted-foreground text-[11px]">
                                            <div className="flex items-center gap-1">
                                                <span>• {itemCount} Items Returning</span>
                                            </div>
                                            <div className="flex items-center text-primary font-medium">
                                                View Details <ChevronRight className="h-3 w-3 ml-0.5" />
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })
                )}
            </div>
        </div>
    );
}
