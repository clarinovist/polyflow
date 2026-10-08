'use client';

import { useState } from 'react';
import { SalesReturn, Customer, Location } from '@prisma/client';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getStatusLabel, salesLabels, formLabels } from '@/lib/labels';
import { formatRupiah } from '@/lib/utils/utils';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { CheckCircle } from 'lucide-react';
import { ReturnReceiveDialog } from './ReturnReceiveDialog';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
    confirmSalesReturnAction,
    completeSalesReturnAction,
    cancelSalesReturnAction,
} from '@/actions/sales/sales-returns';
import { EntityStatusTimeline } from '@/components/shared/EntityStatusTimeline';
import { ReturnDetailHeader } from '@/components/workflow-detail/ReturnDetailHeader';
import { ReturnSummaryGrid } from '@/components/workflow-detail/ReturnSummaryGrid';
import { ReturnProgress } from '@/components/workflow-detail/ReturnProgress';
import { ReturnActivityTabs } from '@/components/workflow-detail/ReturnActivityTabs';

// Detailed type including relations
type ReturnDetail = SalesReturn & {
    customer: Customer | null;
    returnLocation: Location | null;
    salesOrder: { orderNumber: string } | null;
    deliveryOrder: { deliveryNumber: string } | null;
    createdBy: { name: string } | null;
    items: {
        id: string;
        condition: string;
        returnedQty: number | string;
        unitPrice: number | string;
        productVariant: {
            skuCode: string;
            product: { name: string } | null;
        } | null;
    }[];
};

interface SalesReturnDetailClientProps {
    salesReturn: ReturnDetail;
    currentUserRole?: string | null;
    basePath?: string;
}

export function SalesReturnDetailClient({
    salesReturn,
    basePath = '/sales/returns',
}: SalesReturnDetailClientProps) {
    const router = useRouter();
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'DRAFT':
                return (
                    <Badge
                        variant="secondary"
                        className="bg-slate-100 text-slate-800"
                    >
                        {getStatusLabel('DRAFT', 'sales')}
                    </Badge>
                );
            case 'CONFIRMED':
                return (
                    <Badge
                        variant="secondary"
                        className="bg-amber-100 text-amber-800"
                    >
                        {getStatusLabel('CONFIRMED', 'sales')}
                    </Badge>
                );
            case 'RECEIVED':
                return (
                    <Badge
                        variant="secondary"
                        className="bg-blue-100 text-blue-800"
                    >
                        {getStatusLabel('RECEIVED', 'sales')}
                    </Badge>
                );
            case 'COMPLETED':
                return (
                    <Badge
                        variant="secondary"
                        className="bg-emerald-100 text-emerald-800"
                    >
                        {getStatusLabel('COMPLETED', 'sales')}
                    </Badge>
                );
            case 'CANCELLED':
                return (
                    <Badge
                        variant="secondary"
                        className="bg-red-100 text-red-800"
                    >
                        {getStatusLabel('CANCELLED', 'sales')}
                    </Badge>
                );
            default:
                return <Badge>{getStatusLabel(status, 'sales')}</Badge>;
        }
    };

    const handleAction = async (
        actionFn: (id: string) => Promise<unknown>,
        actionName: string,
    ): Promise<boolean> => {
        setActionLoading(actionName);
        try {
            const result = await actionFn(salesReturn.id) as { success: boolean; error?: string };
            if (!result.success) {
                toast.error(result.error ?? 'Gagal memproses retur penjualan.');
                return false;
            }
            const normalizedAction = actionName.toUpperCase();
            const actionText =
                normalizedAction === 'CONFIRM'
                    ? 'dikonfirmasi'
                    : normalizedAction === 'COMPLETE'
                      ? 'diselesaikan'
                      : normalizedAction === 'CANCEL'
                        ? 'dibatalkan'
                        : 'diproses';
            toast.success(`Retur Penjualan berhasil ${actionText}`);
            router.refresh();
            return true;
        } catch {
            toast.error('Gagal memproses retur penjualan. Silakan coba lagi.');
            return false;
        } finally {
            setActionLoading(null);
        }
    };

    return (
        <div className="space-y-6">
            <ReturnDetailHeader
                backHref={basePath}
                title={salesReturn.returnNumber}
                subtitle={
                    'Retur penjualan · ' +
                    (salesReturn.returnDate
                        ? format(
                              new Date(salesReturn.returnDate),
                              'd MMMM yyyy',
                              { locale: id },
                          )
                        : 'Tanggal tidak tersedia')
                }
                statusBadge={getStatusBadge(salesReturn.status)}
                primaryAction={
                    salesReturn.status === 'DRAFT' ? (
                        <Button
                            onClick={() =>
                                handleAction(
                                    confirmSalesReturnAction,
                                    'Confirm',
                                )
                            }
                            disabled={!!actionLoading}
                        >
                            <CheckCircle className="h-4 w-4" />
                            {actionLoading === 'Confirm'
                                ? 'Memproses...'
                                : 'Konfirmasi Retur'}
                        </Button>
                    ) : salesReturn.status === 'CONFIRMED' ? (
                        <ReturnReceiveDialog
                            returnId={salesReturn.id}
                            items={salesReturn.items.map((item) => ({
                                id: item.id,
                                name:
                                    item.productVariant?.skuCode ??
                                    'Item retur',
                            }))}
                        />
                    ) : salesReturn.status === 'RECEIVED' ? (
                        <Button
                            className="bg-emerald-600 text-white hover:bg-emerald-700"
                            onClick={() =>
                                handleAction(
                                    completeSalesReturnAction,
                                    'Complete',
                                )
                            }
                            disabled={!!actionLoading}
                        >
                            <CheckCircle className="h-4 w-4" />
                            {actionLoading === 'Complete'
                                ? 'Memproses...'
                                : 'Selesaikan Retur'}
                        </Button>
                    ) : undefined
                }
                canCancel={
                    salesReturn.status === 'DRAFT' ||
                    salesReturn.status === 'CONFIRMED'
                }
                isLoading={!!actionLoading}
                onCancel={() =>
                    handleAction(cancelSalesReturnAction, 'Cancel')
                }
            />

            <ReturnSummaryGrid
                partyLabel="Pelanggan"
                partyName={salesReturn.customer?.name || 'Tidak Diketahui'}
                sourceLabel="Referensi SO"
                sourceNumber={
                    salesReturn.salesOrder?.orderNumber ||
                    salesReturn.deliveryOrder?.deliveryNumber ||
                    'Tidak tersedia'
                }
                locationName={
                    salesReturn.returnLocation?.name || 'Tidak Diketahui'
                }
                itemCount={salesReturn.items.length}
                totalAmount={
                    salesReturn.totalAmount == null
                        ? null
                        : Number(salesReturn.totalAmount)
                }
            />

            <ReturnProgress status={salesReturn.status} direction="inbound" />

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <Card className="min-w-0 md:col-span-2">
                    <CardHeader>
                        <CardTitle>Detail Retur Penjualan</CardTitle>
                        <CardDescription>
                            Barang, kondisi, alasan, dan nilai dokumen retur.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <h4 className="text-sm font-medium text-muted-foreground mb-1">
                                    {salesLabels.customer}
                                </h4>
                                <p className="font-medium">
                                    {salesReturn.customer?.name ||
                                        'Tidak Diketahui'}
                                </p>
                            </div>
                            <div>
                                <h4 className="text-sm font-medium text-muted-foreground mb-1">
                                    {salesLabels.returnLocation}
                                </h4>
                                <p className="font-medium">
                                    {salesReturn.returnLocation?.name ||
                                        'Tidak Diketahui'}
                                </p>
                            </div>
                            {salesReturn.salesOrder && (
                                <div>
                                    <h4 className="text-sm font-medium text-muted-foreground mb-1">
                                        Referensi SO
                                    </h4>
                                    <p className="font-medium">
                                        {salesReturn.salesOrder.orderNumber}
                                    </p>
                                </div>
                            )}
                            <div>
                                <h4 className="text-sm font-medium text-muted-foreground mb-1">
                                    {salesLabels.reason}
                                </h4>
                                <p className="font-medium truncate">
                                    {salesReturn.reason?.replace(/_/g, ' ') ||
                                        '-'}
                                </p>
                            </div>
                        </div>

                        {salesReturn.notes && (
                            <div>
                                <h4 className="text-sm font-medium text-muted-foreground mb-1">
                                    {formLabels.notes}
                                </h4>
                                <p className="text-sm bg-muted/50 p-3 rounded-md">
                                    {salesReturn.notes}
                                </p>
                            </div>
                        )}

                        <div>
                            <h4 className="text-lg font-semibold mb-3">
                                Item Diretur
                            </h4>
                            <div
                                className="overflow-x-auto rounded-md border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                role="region"
                                aria-label="Item retur penjualan"
                                tabIndex={0}
                            >
                                <table className="w-full min-w-[700px] text-sm">
                                    <thead className="bg-muted/50">
                                        <tr>
                                            <th className="px-4 py-3 text-left font-medium">
                                                {formLabels.product}
                                            </th>
                                            <th className="px-4 py-3 text-center font-medium">
                                                {salesLabels.condition}
                                            </th>
                                            <th className="px-4 py-3 text-right font-medium">
                                                {formLabels.qty}
                                            </th>
                                            <th className="px-4 py-3 text-right font-medium">
                                                {formLabels.unitPrice}
                                            </th>
                                            <th className="px-4 py-3 text-right font-medium">
                                                {formLabels.total}
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {salesReturn.items.map((item, idx) => (
                                            <tr key={idx}>
                                                <td className="px-4 py-3">
                                                    <div className="font-medium">
                                                        {
                                                            item.productVariant
                                                                ?.product?.name
                                                        }
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {
                                                            item.productVariant
                                                                ?.skuCode
                                                        }
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <Badge variant="outline">
                                                        {item.condition}
                                                    </Badge>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    {Number(item.returnedQty)}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    {formatRupiah(
                                                        Number(item.unitPrice),
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-right font-medium">
                                                    {formatRupiah(
                                                        Number(
                                                            item.returnedQty,
                                                        ) *
                                                            Number(
                                                                item.unitPrice,
                                                            ),
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                        <tr className="bg-muted/20">
                                            <td
                                                colSpan={4}
                                                className="px-4 py-3 text-right font-semibold"
                                            >
                                                Total Keseluruhan
                                            </td>
                                            <td className="px-4 py-3 text-right font-bold text-primary whitespace-nowrap">
                                                {salesReturn.totalAmount
                                                    ? formatRupiah(
                                                          Number(
                                                              salesReturn.totalAmount,
                                                          ),
                                                      )
                                                    : '-'}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start xl:top-40">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm">Ringkasan</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 text-sm">
                            <div className="flex justify-between items-center py-2 border-b">
                                <span className="text-muted-foreground">
                                    Dibuat Oleh
                                </span>
                                <span className="font-medium">
                                    {salesReturn.createdBy?.name || 'Sistem'}
                                </span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b">
                                <span className="text-muted-foreground">
                                    Total Item
                                </span>
                                <span className="font-medium">
                                    {salesReturn.items.length} varian
                                </span>
                            </div>
                            <div className="flex justify-between items-center py-2">
                                <span className="text-muted-foreground">
                                    Total Nilai
                                </span>
                                <span className="font-bold text-lg">
                                    {salesReturn.totalAmount
                                        ? formatRupiah(
                                              Number(salesReturn.totalAmount),
                                          )
                                        : 'Rp 0'}
                                </span>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm">
                                Dampak Pemrosesan
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm text-muted-foreground">
                            <p>
                                Barang kondisi baik kembali ke inventaris saat
                                penerimaan dikonfirmasi.
                            </p>
                            <p>
                                Kredit piutang diproses terpisah oleh Finance
                                berdasarkan invoice asal.
                            </p>
                        </CardContent>
                    </Card>
                </aside>
            </div>

            <ReturnActivityTabs
                guidance={
                    <>
                        <p><strong>Draf:</strong> Retur dapat diperiksa dan dibatalkan.</p>
                        <p><strong>Dikonfirmasi:</strong> Barang siap diterima dan diverifikasi.</p>
                        <p><strong>Diterima:</strong> Barang baik telah dikembalikan ke inventaris; kredit diproses terpisah.</p>
                        <p><strong>Selesai:</strong> Siklus retur berakhir.</p>
                    </>
                }
                audit={
                    <EntityStatusTimeline
                        entityType="SalesReturn"
                        entityId={salesReturn.id}
                    />
                }
            />
        </div>
    );
}
