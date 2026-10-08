import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface FinancialInvoicePrintActionsProps {
    invoiceId: string;
    onPreview: () => void;
}

export function FinancialInvoicePrintActions({
    invoiceId,
    onPreview,
}: FinancialInvoicePrintActionsProps) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline">
                    <Printer className="h-4 w-4" />
                    Cetak & Dokumen
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-56">
                <DropdownMenuLabel>Invoice</DropdownMenuLabel>
                <DropdownMenuItem className="min-h-11" onSelect={onPreview}>
                    <Printer className="h-4 w-4" />
                    Cetak Dot Matrix
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="min-h-11">
                    <a href={'/api/print/invoice?id=' + invoiceId}>
                        <Printer className="h-4 w-4" />
                        ESC/P (Dot Matrix)
                    </a>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
