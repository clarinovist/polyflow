'use client';

import { useState } from 'react';
import { PurchaseReturn, Supplier, Location } from '@prisma/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatRupiah } from '@/lib/utils/utils';
import { format } from 'date-fns';
import { ArrowLeft, CheckCircle, PackageCheck, Ban } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { 
    confirmPurchaseReturnAction, 
    shipPurchaseReturnAction, 
    completePurchaseReturnAction, 
    cancelPurchaseReturnAction 
} from '@/actions/purchasing/purchase-returns';
import Link from 'next/link';
import { getStatusLabel, purchasingLabels, formLabels } from '@/lib/labels';

// Detailed type including relations
type ReturnDetail = PurchaseReturn & {
    supplier: Supplier | null;
    sourceLocation: Location | null;
    purchaseOrder: { orderNumber: string } | null;
    createdBy: { name: string } | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: any[];
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function PurchaseReturnDetailClient({ purchaseReturn, currentUserRole, basePath = '/planning/purchase-returns' }: PurchaseReturnDetailClientProps) {
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
            <Badge variant="secondary" className={styles[status] || 'bg-slate-100 text-slate-800'}>
                {getStatusLabel(status, 'purchasing')}
            </Badge>
        );
    };

    const handleAction = async (actionFn: (id: string) => Promise<unknown>, actionName: string) => {
        setActionLoading(actionName);
        try {
            await actionFn(purchaseReturn.id);
            const actionText = actionName === 'CONFIRM' ? 'dikonfirmasi' : actionName === 'COMPLETE' ? 'diselesaikan' : 'diproses';
            toast.success(`Retur Pembelian berhasil ${actionText}`);
            router.refresh();
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : `Failed to ${actionName.toLowerCase()} purchase return`);
        } finally {
            setActionLoading(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <Button variant="ghost" asChild>
                    <Link href={basePath}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Kembali ke Retur
                    </Link>
                </Button>
                
                <div className="flex gap-2">
                    {purchaseReturn.status === 'DRAFT' && (
                        <Button 
                            variant="default" 
                            onClick={() => handleAction(confirmPurchaseReturnAction, 'Confirm')}
                            disabled={!!actionLoading}
                        >
                            {actionLoading === 'Confirm' ? 'Memproses...' : <><CheckCircle className="mr-2 h-4 w-4" /> Konfirmasi Retur</>}
                        </Button>
                    )}
                    
                    {purchaseReturn.status === 'CONFIRMED' && (
                        <Button 
                            variant="default"
                            className="bg-blue-600 hover:bg-blue-700"
                            onClick={() => handleAction(shipPurchaseReturnAction, 'Ship')}
                            disabled={!!actionLoading}
                        >
                            {actionLoading === 'Ship' ? 'Memproses...' : <><PackageCheck className="mr-2 h-4 w-4" /> Kirim Item</>}
                        </Button>
                    )}

                    {purchaseReturn.status === 'SHIPPED' && (
                        <Button 
                            variant="default"
                            className="bg-emerald-600 hover:bg-emerald-700"
                            onClick={() => handleAction(completePurchaseReturnAction, 'Complete')}
                            disabled={!!actionLoading}
                        >
                            {actionLoading === 'Complete' ? 'Memproses...' : <><CheckCircle className="mr-2 h-4 w-4" /> Selesaikan Retur</>}
                        </Button>
                    )}

                    {(purchaseReturn.status === 'DRAFT' || purchaseReturn.status === 'CONFIRMED') && (
                        <Button 
                            variant="destructive" 
                            onClick={() => handleAction(cancelPurchaseReturnAction, 'Cancel')}
                            disabled={!!actionLoading}
                        >
                            {actionLoading === 'Cancel' ? 'Memproses...' : <><Ban className="mr-2 h-4 w-4" /> Batalkan Retur</>}
                        </Button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="md:col-span-2">
                    <CardHeader>
                        <div className="flex justify-between items-start">
                            <div>
                                <CardTitle className="text-2xl">{purchaseReturn.returnNumber}</CardTitle>
                                <CardDescription>
                                    Diretur pada {purchaseReturn.returnDate ? format(new Date(purchaseReturn.returnDate), 'PPP') : '-'}
                                </CardDescription>
                            </div>
                            {getStatusBadge(purchaseReturn.status)}
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <h4 className="text-sm font-medium text-muted-foreground mb-1">{purchasingLabels.supplier}</h4>
                                <p className="font-medium">{purchaseReturn.supplier?.name || 'Tidak Diketahui'}</p>
                            </div>
                            <div>
                                <h4 className="text-sm font-medium text-muted-foreground mb-1">Lokasi Pengiriman</h4>
                                <p className="font-medium">{purchaseReturn.sourceLocation?.name || 'Tidak Diketahui'}</p>
                            </div>
                            {purchaseReturn.purchaseOrder && (
                                <div>
                                    <h4 className="text-sm font-medium text-muted-foreground mb-1">Referensi PO</h4>
                                    <p className="font-medium">{purchaseReturn.purchaseOrder.orderNumber}</p>
                                </div>
                            )}
                            <div>
                                <h4 className="text-sm font-medium text-muted-foreground mb-1">Alasan</h4>
                                <p className="font-medium truncate">{(purchaseReturn.reason && REASON_LABELS[purchaseReturn.reason]) || purchaseReturn.reason?.replace(/_/g, ' ') || '-'}</p>
                            </div>
                        </div>

                        {purchaseReturn.notes && (
                            <div>
                                <h4 className="text-sm font-medium text-muted-foreground mb-1">{formLabels.notes}</h4>
                                <p className="text-sm bg-muted/50 p-3 rounded-md">{purchaseReturn.notes}</p>
                            </div>
                        )}

                        <div>
                            <h4 className="text-lg font-semibold mb-3">Item Diretur</h4>
                            <div className="border rounded-md overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-muted/50">
                                        <tr>
                                            <th className="px-4 py-3 text-left font-medium">{formLabels.product}</th>
                                            <th className="px-4 py-3 text-center font-medium">Kondisi</th>
                                            <th className="px-4 py-3 text-right font-medium">{formLabels.qty}</th>
                                            <th className="px-4 py-3 text-right font-medium">Biaya Satuan</th>
                                            <th className="px-4 py-3 text-right font-medium">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {purchaseReturn.items.map((item, idx) => (
                                            <tr key={idx}>
                                                <td className="px-4 py-3">
                                                    <div className="font-medium">{item.productVariant?.product?.name}</div>
                                                    <div className="text-xs text-muted-foreground">{item.productVariant?.skuCode}</div>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <Badge variant="outline">{item.condition}</Badge>
                                                </td>
                                                <td className="px-4 py-3 text-right">{Number(item.returnedQty)}</td>
                                                <td className="px-4 py-3 text-right">{formatRupiah(Number(item.unitCost))}</td>
                                                <td className="px-4 py-3 text-right font-medium">
                                                    {formatRupiah(Number(item.returnedQty) * Number(item.unitCost))}
                                                </td>
                                            </tr>
                                        ))}
                                        <tr className="bg-muted/20">
                                            <td colSpan={4} className="px-4 py-3 text-right font-semibold">Total Keseluruhan</td>
                                            <td className="px-4 py-3 text-right font-bold text-primary">
                                                {purchaseReturn.totalAmount ? formatRupiah(Number(purchaseReturn.totalAmount)) : '-'}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm">Ringkasan</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 text-sm">
                            <div className="flex justify-between items-center py-2 border-b">
                                <span className="text-muted-foreground">Dibuat Oleh</span>
                                <span className="font-medium">{purchaseReturn.createdBy?.name || 'System'}</span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b">
                                <span className="text-muted-foreground">Total Item</span>
                                <span className="font-medium">{purchaseReturn.items.length} varian</span>
                            </div>
                            <div className="flex justify-between items-center py-2">
                                <span className="text-muted-foreground">Total Nilai</span>
                                <span className="font-bold text-lg">{purchaseReturn.totalAmount ? formatRupiah(Number(purchaseReturn.totalAmount)) : 'Rp 0'}</span>
                            </div>
                        </CardContent>
                    </Card>
                    
                    <Card className="bg-muted/30 border-dashed">
                        <CardContent className="p-4 text-xs text-muted-foreground space-y-2">
                            <p><strong>DRAFT:</strong> Status awal. Dapat diedit atau dibatalkan.</p>
                            <p><strong>CONFIRMED:</strong> Siap untuk mengirimkan item fisik.</p>
                            <p><strong>SHIPPED:</strong> Item dikembalikan ke supplier. Jurnal otomatis dibuat untuk debit note.</p>
                            <p><strong>COMPLETED:</strong> Siklus selesai.</p>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
