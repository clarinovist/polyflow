import { Boxes, Building2, ReceiptText, Warehouse } from 'lucide-react';
import { WorkflowSummaryGrid } from '@/components/workflow-detail/WorkflowSummaryGrid';
import { formatRupiah } from '@/lib/utils/utils';

interface PurchaseOrderSummaryGridProps {
    supplierName: string;
    itemCount: number;
    fullyReceivedItems: number;
    receiptsCount: number;
    invoicesCount: number;
    totalAmount: number;
    warehouseMode: boolean;
}

export function PurchaseOrderSummaryGrid({
    supplierName,
    itemCount,
    fullyReceivedItems,
    receiptsCount,
    invoicesCount,
    totalAmount,
    warehouseMode,
}: PurchaseOrderSummaryGridProps) {
    return (
        <WorkflowSummaryGrid
            label="Ringkasan pesanan pembelian"
            items={[
                {
                    label: 'Supplier',
                    icon: <Building2 className="h-4 w-4" />,
                    value: supplierName,
                },
                {
                    label: 'Pemenuhan Item',
                    icon: <Boxes className="h-4 w-4" />,
                    value:
                        fullyReceivedItems +
                        ' dari ' +
                        itemCount +
                        ' item diterima penuh',
                    detail:
                        fullyReceivedItems === itemCount && itemCount > 0
                            ? 'Seluruh item terpenuhi'
                            : 'Masih ada item yang belum terpenuhi',
                },
                {
                    label: 'Penerimaan',
                    icon: <Warehouse className="h-4 w-4" />,
                    value: receiptsCount + ' dokumen penerimaan',
                    detail:
                        receiptsCount > 0
                            ? 'Riwayat penerimaan tersedia'
                            : 'Belum ada penerimaan barang',
                },
                {
                    label: warehouseMode ? 'Dokumen' : 'Komersial',
                    icon: <ReceiptText className="h-4 w-4" />,
                    value: warehouseMode
                        ? itemCount + ' varian'
                        : formatRupiah(totalAmount),
                    detail: warehouseMode
                        ? 'Harga disembunyikan di portal gudang'
                        : invoicesCount > 0
                          ? invoicesCount + ' invoice terkait'
                          : 'Invoice belum dibuat',
                },
            ]}
        />
    );
}
