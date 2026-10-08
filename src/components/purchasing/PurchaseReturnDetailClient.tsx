'use client';

import { useState } from 'react';
import { PurchaseReturn, Supplier, Location } from '@prisma/client';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatRupiah } from '@/lib/utils/utils';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { CheckCircle, PackageCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
    confirmPurchaseReturnAction,
    shipPurchaseReturnAction,
    completePurchaseReturnAction,
    cancelPurchaseReturnAction,
} from '@/actions/purchasing/purchase-returns';
import { getStatusLabel, purchasingLabels, formLabels } from '@/lib/labels';
import { EntityStatusTimeline } from '@/components/shared/EntityStatusTimeline';
import { ReturnDetailHeader } from '@/components/workflow-detail/ReturnDetailHeader';
import { ReturnSummaryGrid } from '@/components/workflow-detail/ReturnSummaryGrid';
import { ReturnProgress } from '@/components/workflow-detail/ReturnProgress';
import { ReturnActivityTabs } from '@/components/workflow-detail/ReturnActivityTabs';

// View shape of a returned line item (only the fields this component reads)
type ReturnDetailItem = {
    condition?: string | null;
    returnedQty: number;
    unitCost: number;
    productVariant: {
        skuCode: string;
        product: { name: string } | null;
    } | null;
};

// Detailed type including relations
type ReturnDetail = PurchaseReturn & {
    supplier: Supplier | null;
    sourceLocation: Location | null;
    purchaseOrder: { orderNumber: string } | null;
    createdBy: { name: string } | null;
    items: ReturnDetailItem[];
};

interface PurchaseReturnDetailClientProps {
    purchaseReturn: ReturnDetail;
    currentUserRole?: string | null;
    basePath?: string;
}

const REASON_LABELS: Record<string, string> = {
    DEFECTIVE: 'Cacat / Rusak',
    WRONG_ITEM: 'Salah Barang',
    NOT_NEEDED: 'Tidak Dibutuhkan',
    DAMAGE_IN_TRANSIT: 'Rusak Selama Pengiriman',
    OTHER: 'Lainnya',
};

export function PurchaseReturnDetailClient({
    purchaseReturn,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    currentUserRole,
    basePath = '/purchasing/returns',
}: PurchaseReturnDetailClientProps) {
    const router = useRouter();
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    const getStatusBadge = (status: string) => {
        const styles: Record<string, string> = {
            DRAFT: 'bg-slate-100 text-slate-800',
            CONFIRMED: 'bg-amber-100 text-amber-800',
            SHIPPED: 'bg-blue-100 text-blue-800',
            COMPLETED: 'bg-emerald-100 text-emerald-800',
            CANCELLED: 'bg-red-100 text-red-800',
        };
        return (
            <Badge
                variant="secondary"
                className={styles[status] || 'bg-slate-100 text-slate-800'}
            >
                {getStatusLabel(status, 'purchasing')}
            </Badge>
        );
    };

    const handleAction = async (
        actionFn: (id: string) => Promise<unknown>,
        actionName: string,
    ): Promise<boolean> => {
        setActionLoading(actionName);
        try {
            const result = (await actionFn(purchaseReturn.id)) as
                | { success: boolean; error?: string }
                | undefined;
            if (result && !result.success) {
                toast.error(result.error ?? 'Gagal memproses retur pembelian.');
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
            toast.success(`Retur Pembelian berhasil ${actionText}`);
            router.refresh();
            return true;
        } catch {
            toast.error('Gagal memproses retur pembelian. Silakan coba lagi.');
            return false;
        } finally {
            setActionLoading(null);
        }
    };

    return (
        <div className="space-y-6">
            <ReturnDetailHeader
                backHref={basePath}
                title={purchaseReturn.returnNumber}
                subtitle={
                    'Retur pembelian · ' +
                    (purchaseReturn.returnDate
                        ? format(
                              new Date(purchaseReturn.returnDate),
                              'd MMMM yyyy',
                              { locale: id },
                          )
                        : 'Tanggal tidak tersedia')
                }
                statusBadge={getStatusBadge(purchaseReturn.status)}
                primaryAction={
                    purchaseReturn.status === 'DRAFT' ? (
                        <Button
                            onClick={() =>
                                handleAction(
                                    confirmPurchaseReturnAction,
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
                    ) : purchaseReturn.status === 'CONFIRMED' ? (
                        <Button
                            className="bg-blue-600 text-white hover:bg-blue-700"
                            onClick={() =>
                                handleAction(shipPurchaseReturnAction, 'Ship')
                            }
                            disabled={!!actionLoading}
                        >
                            <PackageCheck className="h-4 w-4" />
                            {actionLoading === 'Ship'
                                ? 'Memproses...'
                                : 'Kirim Item'}
                        </Button>
                    ) : purchaseReturn.status === 'SHIPPED' ? (
                        <Button
                            className="bg-emerald-600 text-white hover:bg-emerald-700"
                            onClick={() =>
                                handleAction(
                                    completePurchaseReturnAction,
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
                    purchaseReturn.status === 'DRAFT' ||
                    purchaseReturn.status === 'CONFIRMED'
                }
                isLoading={!!actionLoading}
                onCancel={() =>
                    handleAction(cancelPurchaseReturnAction, 'Cancel')
                }
            />

            <ReturnSummaryGrid
                partyLabel="Supplier"
                partyName={purchaseReturn.supplier?.name || 'Tidak Diketahui'}
                sourceLabel="Referensi PO"
                sourceNumber={
                    purchaseReturn.purchaseOrder?.orderNumber ||
                    'Tidak tersedia'
                }
                locationName={
                    purchaseReturn.sourceLocation?.name || 'Tidak Diketahui'
                }
                itemCount={purchaseReturn.items.length}
                totalAmount={
                    purchaseReturn.totalAmount == null
                        ? null
                        : Number(purchaseReturn.totalAmount)
                }
            />

            <ReturnProgress status={purchaseReturn.status} direction="outbound" />

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <Card className="min-w-0 md:col-span-2">
                    <CardHeader>
                        <CardTitle>Detail Retur Pembelian</CardTitle>
                        <CardDescription>
                            Barang, kondisi, alasan, dan nilai dokumen retur.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <h4 className="text-sm font-medium text-muted-foreground mb-1">
                                    {purchasingLabels.supplier}
                                </h4>
                                <p className="font-medium">
                                    {purchaseReturn.supplier?.name ||
                                        'Tidak Diketahui'}
                                </p>
                            </div>
                            <div>
                                <h4 className="text-sm font-medium text-muted-foreground mb-1">
                                    Lokasi Pengiriman
                                </h4>
                                <p className="font-medium">
                                    {purchaseReturn.sourceLocation?.name ||
                                        'Tidak Diketahui'}
                                </p>
                            </div>
                            {purchaseReturn.purchaseOrder && (
                                <div>
                                    <h4 className="text-sm font-medium text-muted-foreground mb-1">
                                        Referensi PO
                                    </h4>
                                    <p className="font-medium">
                                        {
                                            purchaseReturn.purchaseOrder
                                                .orderNumber
                                        }
                                    </p>
                                </div>
                            )}
                            <div>
                                <h4 className="text-sm font-medium text-muted-foreground mb-1">
                                    Alasan
                                </h4>
                                <p className="font-medium truncate">
                                    {(purchaseReturn.reason &&
                                        REASON_LABELS[purchaseReturn.reason]) ||
                                        purchaseReturn.reason?.replace(
                                            /_/g,
                                            ' ',
                                        ) ||
                                        '-'}
                                </p>
                            </div>
                        </div>

                        {purchaseReturn.notes && (
                            <div>
                                <h4 className="text-sm font-medium text-muted-foreground mb-1">
                                    {formLabels.notes}
                                </h4>
                                <p className="text-sm bg-muted/50 p-3 rounded-md">
                                    {purchaseReturn.notes}
                                </p>
                            </div>
                        )}

                        <div>
                            <h4 className="text-lg font-semibold mb-3">
                                Item Diretur
                            </h4>
                            <div
                                className="border rounded-md overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                role="region"
                                aria-label="Item retur pembelian"
                                tabIndex={0}
                            >
                                <table className="w-full min-w-[700px] text-sm">
                                    <thead className="bg-muted/50">
                                        <tr>
                                            <th className="px-4 py-3 text-left font-medium">
                                                {formLabels.product}
                                            </th>
                                            <th className="px-4 py-3 text-center font-medium">
                                                Kondisi
                                            </th>
                                            <th className="px-4 py-3 text-right font-medium">
                                                {formLabels.qty}
                                            </th>
                                            <th className="px-4 py-3 text-right font-medium">
                                                Biaya Satuan
                                            </th>
                                            <th className="px-4 py-3 text-right font-medium">
                                                Total
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {purchaseReturn.items.map(
                                            (item, idx) => (
                                                <tr key={idx}>
                                                    <td className="px-4 py-3">
                                                        <div className="font-medium">
                                                            {
                                                                item
                                                                    .productVariant
                                                                    ?.product
                                                                    ?.name
                                                            }
                                                        </div>
                                                        <div className="text-xs text-muted-foreground">
                                                            {
                                                                item
                                                                    .productVariant
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
                                                        {Number(
                                                            item.returnedQty,
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        {formatRupiah(
                                                            Number(
                                                                item.unitCost,
                                                            ),
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-medium">
                                                        {formatRupiah(
                                                            Number(
                                                                item.returnedQty,
                                                            ) *
                                                                Number(
                                                                    item.unitCost,
                                                                ),
                                                        )}
                                                    </td>
                                                </tr>
                                            ),
                                        )}
                                        <tr className="bg-muted/20">
                                            <td
                                                colSpan={4}
                                                className="px-4 py-3 text-right font-semibold"
                                            >
                                                Total Keseluruhan
                                            </td>
                                            <td className="px-4 py-3 text-right font-bold text-primary whitespace-nowrap">
                                                {purchaseReturn.totalAmount
                                                    ? formatRupiah(
                                                          Number(
                                                              purchaseReturn.totalAmount,
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
                                    {purchaseReturn.createdBy?.name || 'Sistem'}
                                </span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b">
                                <span className="text-muted-foreground">
                                    Total Item
                                </span>
                                <span className="font-medium">
                                    {purchaseReturn.items.length} varian
                                </span>
                            </div>
                            <div className="flex justify-between items-center py-2">
                                <span className="text-muted-foreground">
                                    Total Nilai
                                </span>
                                <span className="font-bold text-lg">
                                    {purchaseReturn.totalAmount
                                        ? formatRupiah(
                                              Number(
                                                  purchaseReturn.totalAmount,
                                              ),
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
                                Item dikirim kembali ke supplier setelah retur
                                dikonfirmasi.
                            </p>
                            <p>
                                Penyelesaian dokumen mengikuti proses nota debit
                                dan jurnal yang berlaku.
                            </p>
                        </CardContent>
                    </Card>
                </aside>
            </div>

            <ReturnActivityTabs
                guidance={
                    <>
                        <p><strong>Draf:</strong> Retur dapat diperiksa dan dibatalkan.</p>
                        <p><strong>Dikonfirmasi:</strong> Barang siap dikirim kembali ke supplier.</p>
                        <p><strong>Dikirim:</strong> Barang sudah keluar menuju supplier.</p>
                        <p><strong>Selesai:</strong> Siklus retur dan dokumen terkait berakhir.</p>
                    </>
                }
                audit={
                    <EntityStatusTimeline
                        entityType="PurchaseReturn"
                        entityId={purchaseReturn.id}
                    />
                }
            />
        </div>
    );
}
