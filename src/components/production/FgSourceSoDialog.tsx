'use client';

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

interface FgSourceSoItem {
    soItemId: string;
    soId: string;
    orderNumber: string;
    customerName: string | null;
    residualQty: number;
    expectedDate: string | null;
    status: string;
}

interface FgSourceSoDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    productName: string;
    variantName: string;
    skuCode: string;
    unit: string;
    sourceSoItems: FgSourceSoItem[];
}

const statusBadge = (status: string) => {
    switch (status) {
        case 'CONFIRMED':
            return (
                <Badge variant="outline" className="text-[10px] py-0 h-5">
                    Confirmed
                </Badge>
            );
        case 'IN_PRODUCTION':
            return (
                <Badge
                    variant="outline"
                    className="bg-warning/10 text-warning border-warning/20 text-[10px] py-0 h-5"
                >
                    In Production
                </Badge>
            );
        case 'READY_TO_SHIP':
            return (
                <Badge
                    variant="outline"
                    className="bg-blue-500/10 text-blue-600 border-blue-500/20 text-[10px] py-0 h-5"
                >
                    Ready to Ship
                </Badge>
            );
        default:
            return (
                <Badge variant="secondary" className="text-[10px] py-0 h-5">
                    {status}
                </Badge>
            );
    }
};

export function FgSourceSoDialog({
    open,
    onOpenChange,
    productName,
    variantName,
    skuCode,
    unit,
    sourceSoItems,
}: FgSourceSoDialogProps) {
    const totalResidual = sourceSoItems.reduce(
        (sum, item) => sum + item.residualQty,
        0,
    );
    const distinctSoCount = new Set(sourceSoItems.map((item) => item.soId))
        .size;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[560px]">
                <DialogHeader>
                    <DialogTitle>Sumber Sales Order</DialogTitle>
                    <DialogDescription>
                        {productName} — {variantName} ({skuCode})
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>
                            {distinctSoCount} SO
                            {sourceSoItems.length !== distinctSoCount
                                ? ` · ${sourceSoItems.length} baris`
                                : ''}
                        </span>
                        <span>
                            Total residual:{' '}
                            <span className="font-medium text-foreground">
                                {totalResidual.toLocaleString('id-ID')} {unit}
                            </span>
                        </span>
                    </div>

                    <div className="rounded-md border overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>No. SO</TableHead>
                                    <TableHead>Customer</TableHead>
                                    <TableHead className="text-right">
                                        Residual
                                    </TableHead>
                                    <TableHead>Due</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="w-8" />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sourceSoItems.map((item) => (
                                    <TableRow key={item.soItemId}>
                                        <TableCell className="font-mono text-xs">
                                            {item.orderNumber}
                                        </TableCell>
                                        <TableCell>
                                            {item.customerName ?? '—'}
                                        </TableCell>
                                        <TableCell className="text-right font-medium">
                                            {item.residualQty.toLocaleString(
                                                'id-ID',
                                            )}{' '}
                                            {unit}
                                        </TableCell>
                                        <TableCell>
                                            {item.expectedDate ? (
                                                format(
                                                    new Date(item.expectedDate),
                                                    'dd MMM yyyy',
                                                    {
                                                        locale: idLocale,
                                                    },
                                                )
                                            ) : (
                                                <span className="text-muted-foreground">
                                                    —
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {statusBadge(item.status)}
                                        </TableCell>
                                        <TableCell>
                                            <a
                                                href={`/sales/orders/${item.soId}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-muted-foreground hover:text-foreground transition-colors"
                                                title="Buka SO"
                                            >
                                                <ExternalLink className="h-3.5 w-3.5" />
                                            </a>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
