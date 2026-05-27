'use client';

import { useState } from 'react';
import { SalesReturn, Customer, Location } from '@prisma/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getStatusLabel, salesLabels, formLabels, actionLabels } from '@/lib/labels';
import { formatRupiah } from '@/lib/utils/utils';
import { format } from 'date-fns';
import { ArrowLeft, CheckCircle, PackageCheck, Ban } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { 
    confirmSalesReturnAction, 
    receiveSalesReturnAction, 
    completeSalesReturnAction, 
    cancelSalesReturnAction 
} from '@/actions/sales/sales-returns';
import Link from 'next/link';

// Detailed type including relations
type ReturnDetail = SalesReturn & {
    customer: Customer | null;
    returnLocation: Location | null;
    salesOrder: { orderNumber: string } | null;
    deliveryOrder: { deliveryNumber: string } | null;
    createdBy: { name: string } | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: any[];
};

interface SalesReturnDetailClientProps {
    salesReturn: ReturnDetail;
    currentUserRole?: string | null;
    basePath?: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function SalesReturnDetailClient({ salesReturn, currentUserRole, basePath = '/sales/returns' }: SalesReturnDetailClientProps) {
    const router = useRouter();
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'DRAFT': return <Badge variant="secondary" className="bg-slate-100 text-slate-800">{getStatusLabel('DRAFT', 'sales')}</Badge>;
            case 'CONFIRMED': return <Badge variant="secondary" className="bg-amber-100 text-amber-800">{getStatusLabel('CONFIRMED', 'sales')}</Badge>;
            case 'RECEIVED': return <Badge variant="secondary" className="bg-blue-100 text-blue-800">{getStatusLabel('RECEIVED', 'sales')}</Badge>;
            case 'COMPLETED': return <Badge variant="secondary" className="bg-emerald-100 text-emerald-800">{getStatusLabel('COMPLETED', 'sales')}</Badge>;
            case 'CANCELLED': return <Badge variant="secondary" className="bg-red-100 text-red-800">{getStatusLabel('CANCELLED', 'sales')}</Badge>;
            default: return <Badge>{getStatusLabel(status, 'sales')}</Badge>;
        }
    };

    const handleAction = async (actionFn: (id: string) => Promise<unknown>, actionName: string) => {
        setActionLoading(actionName);
        try {
            await actionFn(salesReturn.id);
            toast.success(`Sales Return successfully ${actionName.toLowerCase()}ed`);
            router.refresh();
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : `Failed to ${actionName.toLowerCase()} sales return`);
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
                        {actionLabels.back}
                    </Link>
                </Button>
                
                <div className="flex gap-2">
                    {salesReturn.status === 'DRAFT' && (
                        <Button 
                            variant="default" 
                            onClick={() => handleAction(confirmSalesReturnAction, 'Confirm')}
                            disabled={!!actionLoading}
                        >
                            {actionLoading === 'Confirm' ? 'Memproses...' : <><CheckCircle className="mr-2 h-4 w-4" /> Konfirmasi Retur</>}
                        </Button>
                    )}
                    
                    {salesReturn.status === 'CONFIRMED' && (
                        <Button 
                            variant="default"
                            className="bg-blue-600 hover:bg-blue-700"
                            onClick={() => handleAction(receiveSalesReturnAction, 'Receive')}
                            disabled={!!actionLoading}
                        >
                            {actionLoading === 'Receive' ? 'Memproses...' : <><PackageCheck className="mr-2 h-4 w-4" /> Terima Item</>}
                        </Button>
                    )}

                    {salesReturn.status === 'RECEIVED' && (
                        <Button 
                            variant="default"
                            className="bg-emerald-600 hover:bg-emerald-700"
                            onClick={() => handleAction(completeSalesReturnAction, 'Complete')}
                            disabled={!!actionLoading}
                        >
                            {actionLoading === 'Complete' ? 'Memproses...' : <><CheckCircle className="mr-2 h-4 w-4" /> Selesaikan Retur</>}
                        </Button>
                    )}

                    {(salesReturn.status === 'DRAFT' || salesReturn.status === 'CONFIRMED') && (
                        <Button 
                            variant="destructive" 
                            onClick={() => handleAction(cancelSalesReturnAction, 'Cancel')}
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
                                <CardTitle className="text-2xl">{salesReturn.returnNumber}</CardTitle>
                                <CardDescription>
                                    Diretur pada {salesReturn.returnDate ? format(new Date(salesReturn.returnDate), 'PPP') : '-'}
                                </CardDescription>
                            </div>
                            {getStatusBadge(salesReturn.status)}
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <h4 className="text-sm font-medium text-muted-foreground mb-1">{salesLabels.customer}</h4>
                                <p className="font-medium">{salesReturn.customer?.name || 'Tidak Diketahui'}</p>
                            </div>
                            <div>
                                <h4 className="text-sm font-medium text-muted-foreground mb-1">{salesLabels.returnLocation}</h4>
                                <p className="font-medium">{salesReturn.returnLocation?.name || 'Tidak Diketahui'}</p>
                            </div>
                            {salesReturn.salesOrder && (
                                <div>
                                    <h4 className="text-sm font-medium text-muted-foreground mb-1">Referensi SO</h4>
                                    <p className="font-medium">{salesReturn.salesOrder.orderNumber}</p>
                                </div>
                            )}
                            <div>
                                <h4 className="text-sm font-medium text-muted-foreground mb-1">{salesLabels.reason}</h4>
                                <p className="font-medium truncate">{salesReturn.reason?.replace(/_/g, ' ') || '-'}</p>
                            </div>
                        </div>

                        {salesReturn.notes && (
                            <div>
                                <h4 className="text-sm font-medium text-muted-foreground mb-1">{formLabels.notes}</h4>
                                <p className="text-sm bg-muted/50 p-3 rounded-md">{salesReturn.notes}</p>
                            </div>
                        )}

                        <div>
                            <h4 className="text-lg font-semibold mb-3">Item Diretur</h4>
                            <div className="border rounded-md overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-muted/50">
                                        <tr>
                                            <th className="px-4 py-3 text-left font-medium">{formLabels.product}</th>
                                            <th className="px-4 py-3 text-center font-medium">{salesLabels.condition}</th>
                                            <th className="px-4 py-3 text-right font-medium">{formLabels.qty}</th>
                                            <th className="px-4 py-3 text-right font-medium">{formLabels.unitPrice}</th>
                                            <th className="px-4 py-3 text-right font-medium">{formLabels.total}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {salesReturn.items.map((item, idx) => (
                                            <tr key={idx}>
                                                <td className="px-4 py-3">
                                                    <div className="font-medium">{item.productVariant?.product?.name}</div>
                                                    <div className="text-xs text-muted-foreground">{item.productVariant?.skuCode}</div>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <Badge variant="outline">{item.condition}</Badge>
                                                </td>
                                                <td className="px-4 py-3 text-right">{Number(item.returnedQty)}</td>
                                                <td className="px-4 py-3 text-right">{formatRupiah(Number(item.unitPrice))}</td>
                                                <td className="px-4 py-3 text-right font-medium">
                                                    {formatRupiah(Number(item.returnedQty) * Number(item.unitPrice))}
                                                </td>
                                            </tr>
                                        ))}
                                        <tr className="bg-muted/20">
                                            <td colSpan={4} className="px-4 py-3 text-right font-semibold">Total Keseluruhan</td>
                                            <td className="px-4 py-3 text-right font-bold text-primary">
                                                {salesReturn.totalAmount ? formatRupiah(Number(salesReturn.totalAmount)) : '-'}
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
                                <span className="font-medium">{salesReturn.createdBy?.name || 'Sistem'}</span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b">
                                <span className="text-muted-foreground">Total Item</span>
                                <span className="font-medium">{salesReturn.items.length} varian</span>
                            </div>
                            <div className="flex justify-between items-center py-2">
                                <span className="text-muted-foreground">Total Nilai</span>
                                <span className="font-bold text-lg">{salesReturn.totalAmount ? formatRupiah(Number(salesReturn.totalAmount)) : 'Rp 0'}</span>
                            </div>
                        </CardContent>
                    </Card>
                    
                    <Card className="bg-muted/30 border-dashed">
                        <CardContent className="p-4 text-xs text-muted-foreground space-y-2">
                            <p><strong>DRAFT:</strong> Status awal. Dapat diedit atau dibatalkan.</p>
                            <p><strong>TERKONFIRMASI:</strong> Siap untuk menerima barang fisik.</p>
                            <p><strong>DITERIMA:</strong> Item dikembalikan ke inventaris (jika kondisi baik). Jurnal otomatis dibuat untuk nota kredit.</p>
                            <p><strong>SELESAI:</strong> Akhir dari siklus retur.</p>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
