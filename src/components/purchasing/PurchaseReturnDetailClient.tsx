'use client';

import { useState } from 'react';
import { PurchaseReturn, Supplier, Location } from '@prisma/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatRupiah } from '@/lib/utils';
import { format } from 'date-fns';
import { ArrowLeft, CheckCircle, PackageCheck, Ban } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { 
    confirmPurchaseReturnAction, 
    shipPurchaseReturnAction, 
    completePurchaseReturnAction, 
    cancelPurchaseReturnAction 
} from '@/actions/purchase-returns';
import Link from 'next/link';

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function PurchaseReturnDetailClient({ purchaseReturn, currentUserRole, basePath = '/planning/purchase-returns' }: PurchaseReturnDetailClientProps) {
    const router = useRouter();
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'DRAFT': return <Badge variant="secondary" className="bg-slate-100 text-slate-800">Draft</Badge>;
            case 'CONFIRMED': return <Badge variant="secondary" className="bg-amber-100 text-amber-800">Confirmed</Badge>;
            case 'SHIPPED': return <Badge variant="secondary" className="bg-blue-100 text-blue-800">Shipped</Badge>;
            case 'COMPLETED': return <Badge variant="secondary" className="bg-emerald-100 text-emerald-800">Completed</Badge>;
            case 'CANCELLED': return <Badge variant="secondary" className="bg-red-100 text-red-800">Cancelled</Badge>;
            default: return <Badge>{status}</Badge>;
        }
    };

    const handleAction = async (actionFn: (id: string) => Promise<unknown>, actionName: string) => {
        setActionLoading(actionName);
        try {
            await actionFn(purchaseReturn.id);
            toast.success(`Purchase Return successfully ${actionName.toLowerCase()}ed`);
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
                        Back to Returns
                    </Link>
                </Button>
                
                <div className="flex gap-2">
                    {purchaseReturn.status === 'DRAFT' && (
                        <Button 
                            variant="default" 
                            onClick={() => handleAction(confirmPurchaseReturnAction, 'Confirm')}
                            disabled={!!actionLoading}
                        >
                            {actionLoading === 'Confirm' ? 'Processing...' : <><CheckCircle className="mr-2 h-4 w-4" /> Confirm Return</>}
                        </Button>
                    )}
                    
                    {purchaseReturn.status === 'CONFIRMED' && (
                        <Button 
                            variant="default"
                            className="bg-blue-600 hover:bg-blue-700"
                            onClick={() => handleAction(shipPurchaseReturnAction, 'Ship')}
                            disabled={!!actionLoading}
                        >
                            {actionLoading === 'Ship' ? 'Processing...' : <><PackageCheck className="mr-2 h-4 w-4" /> Ship Items</>}
                        </Button>
                    )}

                    {purchaseReturn.status === 'SHIPPED' && (
                        <Button 
                            variant="default"
                            className="bg-emerald-600 hover:bg-emerald-700"
                            onClick={() => handleAction(completePurchaseReturnAction, 'Complete')}
                            disabled={!!actionLoading}
                        >
                            {actionLoading === 'Complete' ? 'Processing...' : <><CheckCircle className="mr-2 h-4 w-4" /> Complete Return</>}
                        </Button>
                    )}

                    {(purchaseReturn.status === 'DRAFT' || purchaseReturn.status === 'CONFIRMED') && (
                        <Button 
                            variant="destructive" 
                            onClick={() => handleAction(cancelPurchaseReturnAction, 'Cancel')}
                            disabled={!!actionLoading}
                        >
                            {actionLoading === 'Cancel' ? 'Processing...' : <><Ban className="mr-2 h-4 w-4" /> Cancel Return</>}
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
                                <CardDescription>Returned on {format(new Date(purchaseReturn.returnDate), 'PPP')}</CardDescription>
                            </div>
                            {getStatusBadge(purchaseReturn.status)}
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <h4 className="text-sm font-medium text-muted-foreground mb-1">Supplier</h4>
                                <p className="font-medium">{purchaseReturn.supplier?.name || 'Unknown'}</p>
                            </div>
                            <div>
                                <h4 className="text-sm font-medium text-muted-foreground mb-1">Dispatch Location</h4>
                                <p className="font-medium">{purchaseReturn.sourceLocation?.name || 'Unknown'}</p>
                            </div>
                            {purchaseReturn.purchaseOrder && (
                                <div>
                                    <h4 className="text-sm font-medium text-muted-foreground mb-1">Reference PO</h4>
                                    <p className="font-medium">{purchaseReturn.purchaseOrder.orderNumber}</p>
                                </div>
                            )}
                            <div>
                                <h4 className="text-sm font-medium text-muted-foreground mb-1">Reason</h4>
                                <p className="font-medium truncate">{purchaseReturn.reason?.replace(/_/g, ' ') || '-'}</p>
                            </div>
                        </div>

                        {purchaseReturn.notes && (
                            <div>
                                <h4 className="text-sm font-medium text-muted-foreground mb-1">Notes</h4>
                                <p className="text-sm bg-muted/50 p-3 rounded-md">{purchaseReturn.notes}</p>
                            </div>
                        )}

                        <div>
                            <h4 className="text-lg font-semibold mb-3">Returned Items</h4>
                            <div className="border rounded-md overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-muted/50">
                                        <tr>
                                            <th className="px-4 py-3 text-left font-medium">Product</th>
                                            <th className="px-4 py-3 text-center font-medium">Condition</th>
                                            <th className="px-4 py-3 text-right font-medium">Qty</th>
                                            <th className="px-4 py-3 text-right font-medium">Unit Cost</th>
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
                                            <td colSpan={4} className="px-4 py-3 text-right font-semibold">Total Amount</td>
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
                            <CardTitle className="text-sm">Summary</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 text-sm">
                            <div className="flex justify-between items-center py-2 border-b">
                                <span className="text-muted-foreground">Created By</span>
                                <span className="font-medium">{purchaseReturn.createdBy?.name || 'System'}</span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b">
                                <span className="text-muted-foreground">Total Items</span>
                                <span className="font-medium">{purchaseReturn.items.length} variants</span>
                            </div>
                            <div className="flex justify-between items-center py-2">
                                <span className="text-muted-foreground">Total Value</span>
                                <span className="font-bold text-lg">{purchaseReturn.totalAmount ? formatRupiah(Number(purchaseReturn.totalAmount)) : 'RP 0'}</span>
                            </div>
                        </CardContent>
                    </Card>
                    
                    <Card className="bg-muted/30 border-dashed">
                        <CardContent className="p-4 text-xs text-muted-foreground space-y-2">
                            <p><strong>DRAFT:</strong> Initial state. Can be edited or cancelled.</p>
                            <p><strong>CONFIRMED:</strong> Ready to dispatch physical items.</p>
                            <p><strong>SHIPPED:</strong> Items returned to supplier. Auto-journal generated for debit note.</p>
                            <p><strong>COMPLETED:</strong> End of lifecycle.</p>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
