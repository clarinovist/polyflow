'use client';

import { SalesQuotation, SalesQuotationItem, ProductVariant, Product, Customer, User, SalesOrder } from '@prisma/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Calendar, FileText, User as UserIcon, CheckCircle2, ArrowRight, Printer, Pencil } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { formatRupiah } from '@/lib/utils/utils';
import { format } from 'date-fns';
import { convertToOrder } from '@/actions/sales/quotations'; // We need updateQuotation to change status?
import { toast } from 'sonner';
import { useState } from 'react';
import { salesLabels, formLabels, actionLabels, getStatusLabel } from '@/lib/labels';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Label } from '@/components/ui/label';
import { getEnteredQuantityDisplay, getEnteredUnitPriceDisplay } from '@/lib/utils/production-units';

// Type definition for serialized props (handling Dates/Decimals as needed or assuming standard object)
// Since we use prisma objects directly in server component, and if serializeData is used, Decimals might be numbers/strings.
// But let's assume standard structure + relations.

type ExtendedQuotation = SalesQuotation & {
    customer: Customer | null;
    items: (SalesQuotationItem & {
        productVariant: ProductVariant & {
            product: Product;
        };
    })[];
    createdBy: User | null;
    salesOrders: SalesOrder[];
};

interface SalesQuotationDetailClientProps {
    quotation: ExtendedQuotation;
    locations: { id: string; name: string; slug: string }[]; // Needed for conversion to choose source location
}

export function SalesQuotationDetailClient({ quotation, locations }: SalesQuotationDetailClientProps) {
    const router = useRouter();
    const [isConverting, setIsConverting] = useState(false);
    const [selectedLocationId, setSelectedLocationId] = useState<string>('');
    const [isConvertDialogOpen, setIsConvertDialogOpen] = useState(false);

    // All locations are valid for quotation-to-order conversion
    const validLocations = locations;

    const handleConvert = async () => {
        if (!selectedLocationId) {
            toast.error("Silakan pilih lokasi gudang sumber untuk pesanan.");
            return;
        }

        setIsConverting(true);
        try {
            const result = await convertToOrder(quotation.id, selectedLocationId);
            if (!result.success) {
                toast.error(result.error || "Gagal mengonversi quotation. Silakan coba lagi.");
                return;
            }
            if (result.data) {
                toast.success('Quotation berhasil dikonversi menjadi Sales Order!');
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                router.push(`/sales/orders/${(result.data as any).id}`);
            }
        } catch {
            toast.error("Gagal mengonversi quotation. Silakan coba lagi.");
        } finally {
            setIsConverting(false);
            setIsConvertDialogOpen(false);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'DRAFT': return 'bg-slate-100 text-slate-800 border-slate-200';
            case 'SENT': return 'bg-blue-100 text-blue-800 border-blue-200';
            case 'ACCEPTED': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
            case 'REJECTED': return 'bg-red-100 text-red-800 border-red-200';
            case 'EXPIRED': return 'bg-amber-100 text-amber-800 border-amber-200';
            case 'CONVERTED': return 'bg-purple-100 text-purple-800 border-purple-200';
            default: return 'bg-slate-100 text-slate-800';
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <Button variant="ghost" className="gap-2" onClick={() => router.back()}>
                    <ArrowLeft className="h-4 w-4" /> Kembali ke Penawaran
                </Button>
                <div className="flex items-center gap-2">
                    {quotation.status !== 'CONVERTED' && quotation.status !== 'EXPIRED' && quotation.status !== 'REJECTED' && (
                        <Button variant="outline" className="gap-2" onClick={() => router.push(`/sales/quotations/${quotation.id}/edit`)}>
                            <Pencil className="h-4 w-4" /> Edit
                        </Button>
                    )}
                    <Button variant="outline" className="gap-2">
                        <Printer className="h-4 w-4" /> Cetak / PDF
                    </Button>
                    {quotation.status !== 'CONVERTED' && quotation.status !== 'REJECTED' && quotation.status !== 'EXPIRED' && (
                        <Dialog open={isConvertDialogOpen} onOpenChange={setIsConvertDialogOpen}>
                            <DialogTrigger asChild>
                                <Button className="gap-2">
                                    <ArrowRight className="h-4 w-4" /> Konversi ke Sales Order
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Konversi ke Sales Order</DialogTitle>
                                    <DialogDescription>
                                        Aksi ini akan membuat Sales Order baru dari penawaran ini. Silakan pilih gudang sumber.
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="grid gap-4 py-4">
                                    <div className="grid gap-2">
                                        <Label htmlFor="location">{salesLabels.sourceWarehouse}</Label>
                                        <Select onValueChange={setSelectedLocationId} value={selectedLocationId}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Pilih gudang" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {validLocations.map((loc) => (
                                                    <SelectItem key={loc.id} value={loc.id}>
                                                        {loc.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setIsConvertDialogOpen(false)}>{actionLabels.cancel}</Button>
                                    <Button onClick={handleConvert} disabled={isConverting || !selectedLocationId}>
                                        {isConverting && <CheckCircle2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Konfirmasi Konversi
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="md:col-span-2">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle className="flex items-center gap-2">
                                <FileText className="h-5 w-5 text-muted-foreground" />
                                {quotation.quotationNumber}
                            </CardTitle>
                            <Badge variant="secondary" className={getStatusColor(quotation.status)}>
                                {getStatusLabel(quotation.status, 'sales')}
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {/* Order Details Grid */}
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <p className="text-muted-foreground">{salesLabels.quotationDate}</p>
                                <p className="font-medium flex items-center gap-2">
                                    <Calendar className="h-4 w-4 text-muted-foreground" />
                                    {format(new Date(quotation.quotationDate), 'PPP')}
                                </p>
                            </div>
                            <div>
                                <p className="text-muted-foreground">{salesLabels.validUntil}</p>
                                <p className="font-medium">
                                    {quotation.validUntil ? format(new Date(quotation.validUntil), 'PPP') : '-'}
                                </p>
                            </div>
                            <div className="col-span-2">
                                <p className="text-muted-foreground">{formLabels.notes}</p>
                                <p className="mt-1">{quotation.notes || '-'}</p>
                            </div>
                        </div>

                        {/* Items Table */}
                        <div className="border rounded-md overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/50">
                                    <tr className="border-b">
                                        <th className="h-10 px-4 text-left font-medium">{formLabels.product}</th>
                                        <th className="h-10 px-4 text-right font-medium">{formLabels.qty}</th>
                                        <th className="h-10 px-4 text-right font-medium">{formLabels.unitPrice}</th>
                                        <th className="h-10 px-4 text-right font-medium">Diskon</th>
                                        <th className="h-10 px-4 text-right font-medium">Pajak</th>
                                        <th className="h-10 px-4 text-right font-medium">{formLabels.total}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {quotation.items.map((item) => (
                                        <tr key={item.id} className="border-b last:border-0">
                                            <td className="p-4">
                                                <div className="font-medium">{item.productVariant.product.name}</div>
                                                <div className="text-muted-foreground text-xs">{item.productVariant.name} ({item.productVariant.skuCode})</div>
                                            </td>
                                            <td className="p-4 text-right">
                                                {getEnteredQuantityDisplay({ ...item, ...item.productVariant })}
                                            </td>
                                            <td className="p-4 text-right">
                                                {(() => {
                                                    const price = getEnteredUnitPriceDisplay({ ...item, ...item.productVariant });
                                                    return `${formatRupiah(price.price)}/${price.unit}`;
                                                })()}
                                            </td>
                                            <td className="p-4 text-right text-red-600">
                                                {Number(item.discountPercent) > 0 ? `-${Number(item.discountPercent)}%` : '-'}
                                            </td>
                                            <td className="p-4 text-right">
                                                {Number(item.taxPercent) > 0 ? `${Number(item.taxPercent)}%` : '-'}
                                            </td>
                                            <td className="p-4 text-right font-medium">{formatRupiah(Number(item.subtotal))}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="bg-muted/50 font-medium">
                                    <tr>
                                        <td colSpan={5} className="px-4 py-2 text-right text-muted-foreground">{formLabels.subtotal}</td>
                                        <td className="px-4 py-2 text-right">
                                            {formatRupiah(
                                                (Number(quotation.totalAmount) || 0) + (Number(quotation.discountAmount) || 0) - (Number(quotation.taxAmount) || 0)
                                            )}
                                        </td>
                                    </tr>
                                    <tr>
                                        <td colSpan={5} className="px-4 py-2 text-right text-muted-foreground">Diskon</td>
                                        <td className="px-4 py-2 text-right text-red-600">
                                            -{formatRupiah(Number(quotation.discountAmount) || 0)}
                                        </td>
                                    </tr>
                                    <tr>
                                        <td colSpan={5} className="px-4 py-2 text-right text-muted-foreground">Pajak</td>
                                        <td className="px-4 py-2 text-right">
                                            {formatRupiah(Number(quotation.taxAmount) || 0)}
                                        </td>
                                    </tr>
                                    <tr className="border-t border-muted-foreground/20 text-base">
                                        <td colSpan={5} className="px-4 py-3 text-right">Total Keseluruhan</td>
                                        <td className="px-4 py-3 text-right font-bold">
                                            {formatRupiah(Number(quotation.totalAmount) || 0)}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </CardContent>
                </Card>

                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Detail Customer</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                                        <UserIcon className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <div className="font-medium">{quotation.customer?.name || 'Prospek Customer'}</div>
                                        <div className="text-sm text-muted-foreground">{quotation.customer?.email || '-'}</div>
                                    </div>
                                </div>
                                {quotation.customer && (
                                    <>
                                        <div className="text-sm">
                                            <p className="text-muted-foreground mb-1">Alamat Pengiriman</p>
                                            <p>{quotation.customer.shippingAddress || '-'}</p>
                                        </div>
                                    </>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Dibuat Oleh</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                                    <UserIcon className="h-4 w-4 text-muted-foreground" />
                                </div>
                                <div className="text-sm">
                                    <p className="font-medium">{quotation.createdBy?.name || 'Sistem'}</p>
                                    <p className="text-muted-foreground text-xs">
                                        {format(new Date(quotation.createdAt), 'PP p')}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {quotation.salesOrders.length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Pesanan Terkait</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-2">
                                    {quotation.salesOrders.map(order => (
                                        <div key={order.id} className="flex items-center justify-between border p-2 rounded text-sm hover:bg-muted/50 cursor-pointer" onClick={() => router.push(`/sales/orders/${order.id}`)}>
                                            <div className="font-medium">{order.orderNumber}</div>
                                            <Badge variant="outline" className="text-xs">{order.status}</Badge>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
}
