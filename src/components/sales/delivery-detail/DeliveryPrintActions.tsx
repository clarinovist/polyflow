import { Printer } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import type { DeliveryOrderDetailData } from './types';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface DeliveryPrintActionsProps {
    order: DeliveryOrderDetailData;
    invoices: NonNullable<
        NonNullable<DeliveryOrderDetailData['salesOrder']>['invoices']
    >;
    bundleHref: (invoiceId: string) => string;
    setShowPreview: Dispatch<SetStateAction<boolean>> | ((open: boolean) => void);
}

export function DeliveryPrintActions({
    order,
    invoices,
    bundleHref,
    setShowPreview,
}: DeliveryPrintActionsProps) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline">
                    <Printer className="h-4 w-4" />
                    Cetak & Dokumen
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-64">
                <DropdownMenuLabel>Surat Jalan</DropdownMenuLabel>
                <DropdownMenuItem
                    className="min-h-11"
                    onSelect={() => setShowPreview(true)}
                >
                    <Printer className="h-4 w-4" />
                    Cetak Surat Jalan
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="min-h-11">
                    <a href={`/api/print/delivery?id=${order.id}`}>
                        <Printer className="h-4 w-4" />
                        ESC/P (Dot Matrix)
                    </a>
                </DropdownMenuItem>
                {invoices.length > 0 && <DropdownMenuSeparator />}
                {invoices.length === 1 && (
                    <DropdownMenuItem asChild className="min-h-11">
                        <a href={bundleHref(invoices[0].id)}>
                            <Printer className="h-4 w-4" />
                            ESC/P: SJ + Invoice
                        </a>
                    </DropdownMenuItem>
                )}
                {invoices.length > 1 && (
                    <>
                        <DropdownMenuLabel>
                            ESC/P: SJ + Invoice
                        </DropdownMenuLabel>
                        {invoices.map((invoice) => (
                            <DropdownMenuItem
                                key={invoice.id}
                                asChild
                                className="min-h-11"
                            >
                                <a
                                    href={bundleHref(invoice.id)}
                                    aria-label={`Cetak ESC/P surat jalan dengan ${invoice.invoiceNumber}`}
                                >
                                    <Printer className="h-4 w-4" />
                                    {invoice.invoiceNumber}
                                </a>
                            </DropdownMenuItem>
                        ))}
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
