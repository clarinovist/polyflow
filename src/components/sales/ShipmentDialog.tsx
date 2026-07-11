'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { shipSalesOrderSchema, ShipSalesOrderValues } from '@/lib/schemas/sales';
import { shipSalesOrder } from '@/actions/sales/sales';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Truck, AlertTriangle, Package } from 'lucide-react';
import { salesLabels } from '@/lib/labels';

export type OpenDeliveryOrderInfo = {
    id: string;
    orderNumber: string;
    status: string;
};

interface ShipmentDialogProps {
    orderId: string;
    orderNumber: string;
    isMaklon?: boolean;
    isOpen: boolean;
    onClose: () => void;
    /** Open DO (PENDING/LOADING) for this SO — if set, ship commits that DO */
    openDeliveryOrder?: OpenDeliveryOrderInfo | null;
}

export function ShipmentDialog({
    orderId,
    orderNumber,
    isMaklon = false,
    isOpen,
    onClose,
    openDeliveryOrder = null,
}: ShipmentDialogProps) {
    const [isPending, setIsPending] = useState(false);
    const router = useRouter();

    const form = useForm({
        resolver: zodResolver(shipSalesOrderSchema),
        defaultValues: {
            id: orderId,
            carrier: '',
            trackingNumber: '',
        },
    });

    const onSubmit = async (values: ShipSalesOrderValues) => {
        setIsPending(true);
        try {
            const result = await shipSalesOrder(values);
            if (result.success) {
                toast.success(
                    isMaklon
                        ? 'Order jasa berhasil ditutup'
                        : openDeliveryOrder
                          ? `Surat Jalan ${openDeliveryOrder.orderNumber} berhasil dikirim (stok terpotong)`
                          : 'Pesanan berhasil dikirim (SJ dibuat + stok terpotong)',
                );
                onClose();
                router.refresh();
            } else {
                toast.error(
                    result.error ||
                        (isMaklon
                            ? 'Gagal menutup order jasa. Silakan coba lagi.'
                            : 'Gagal mengirim pesanan. Pastikan stok FG cukup di gudang sumber.'),
                );
            }
        } catch (_error) {
            toast.error('Gagal mengirim pesanan. Silakan coba lagi.');
        } finally {
            setIsPending(false);
        }
    };

    const title = isMaklon
        ? `Tutup Order Jasa ${orderNumber}`
        : openDeliveryOrder
          ? `${salesLabels.commitExistingDo}: ${openDeliveryOrder.orderNumber}`
          : `${salesLabels.createAndShip}: ${orderNumber}`;

    const description = isMaklon
        ? 'Gunakan langkah ini untuk menutup order jasa setelah pekerjaan maklon selesai. Isian kurir dan tracking opsional.'
        : openDeliveryOrder
          ? `Akan memotong stok dari gudang untuk Surat Jalan ${openDeliveryOrder.orderNumber} (status ${openDeliveryOrder.status}). Pastikan produksi sudah diinput ke sistem.`
          : 'Belum ada Surat Jalan aktif. Sistem akan membuat SJ dari sisa qty SO lalu langsung potong stok. Untuk cetak SJ dulu tanpa potong stok, gunakan tombol Buat Surat Jalan.';

    const submitLabel = isMaklon
        ? 'Konfirmasi Penutupan Layanan'
        : openDeliveryOrder
          ? salesLabels.tandaiDikirim
          : salesLabels.createAndShip;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Truck className="h-5 w-5 text-purple-600" />
                        {title}
                    </DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>

                {!isMaklon && openDeliveryOrder && (
                    <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                        <AlertTitle className="text-amber-800 dark:text-amber-200">
                            {salesLabels.sjShippedHint}
                        </AlertTitle>
                        <AlertDescription className="text-amber-700 dark:text-amber-300 text-sm">
                            {salesLabels.tandaiDikirimConfirm}{' '}
                            <Link
                                href={`/sales/deliveries/${openDeliveryOrder.id}`}
                                className="font-medium underline underline-offset-2"
                                onClick={onClose}
                            >
                                Buka detail {openDeliveryOrder.orderNumber}
                            </Link>
                        </AlertDescription>
                    </Alert>
                )}

                {!isMaklon && !openDeliveryOrder && (
                    <Alert>
                        <Package className="h-4 w-4" />
                        <AlertTitle>{salesLabels.createAndShip}</AlertTitle>
                        <AlertDescription className="text-sm">
                            {salesLabels.sjPendingHint} hanya berlaku jika Anda buat SJ terpisah dulu.
                            Tombol ini langsung commit stok.
                        </AlertDescription>
                    </Alert>
                )}

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
                        <FormField
                            control={form.control}
                            name="carrier"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>
                                        {isMaklon ? 'Kurir (opsional)' : 'Kurir / Ekspedisi'}
                                    </FormLabel>
                                    <FormControl>
                                        <Input placeholder="contoh: JNE, J&T, Armada Internal" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="trackingNumber"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>
                                        {isMaklon ? 'No. Resi (opsional)' : 'No. Resi / Tracking'}
                                    </FormLabel>
                                    <FormControl>
                                        <Input placeholder="AWB / nomor resi" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <DialogFooter className="mt-6">
                            <Button variant="outline" type="button" onClick={onClose} disabled={isPending}>
                                Batal
                            </Button>
                            <Button type="submit" className="bg-purple-600 hover:bg-purple-700" disabled={isPending}>
                                {isPending ? 'Memproses...' : submitLabel}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
