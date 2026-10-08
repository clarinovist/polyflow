import { getOpenDeliveryOrders } from '@/actions/inventory/deliveries';
import { DeliveryOrderTable } from '@/components/sales/DeliveryOrderTable';
import { PageHeader } from '@/components/ui/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { History, Info } from 'lucide-react';
import Link from 'next/link';
import { serializeData } from '@/lib/utils/utils';
import { warehouseLabels } from '@/lib/labels';

export default async function WarehouseOutgoingPage() {
    const result = await getOpenDeliveryOrders();
    if (!result.success) {
        return (
            <div className="space-y-4 p-4 md:p-6">
                <h1 className="text-2xl font-bold md:text-3xl">
                    {warehouseLabels.outgoing}
                </h1>
                <p role="alert" className="text-destructive">
                    {result.error || 'Gagal memuat antrean pengiriman.'}
                </p>
                <p className="text-sm text-muted-foreground">
                    Data tidak dianggap kosong. Muat ulang halaman untuk mencoba
                    lagi.
                </p>
            </div>
        );
    }

    const openOrders = serializeData(result.data ?? []);
    return (
        <div className="flex min-w-0 flex-col gap-6 p-4 md:p-6">
            <PageHeader
                title={warehouseLabels.outgoing}
                description="Perintah muat PENDING/LOADING yang siap atau sedang diproses gudang."
                actions={
                    <Button variant="outline" asChild>
                        <Link href="/warehouse/outgoing/history">
                            <History aria-hidden="true" className="h-4 w-4" />
                            {warehouseLabels.outgoingHistory}
                        </Link>
                    </Button>
                }
            />
            <Alert className="bg-background">
                <Info aria-hidden="true" className="h-4 w-4" />
                <AlertDescription>
                    Mulai muat → verifikasi kuantitas fisik → Tandai Dikirim.
                    Antrean ini hanya memuat status PENDING dan LOADING, dengan
                    LOADING diprioritaskan.
                </AlertDescription>
            </Alert>
            <p className="text-sm text-muted-foreground" role="status">
                {openOrders.length} perintah muat aktif
            </p>
            <DeliveryOrderTable
                initialData={openOrders}
                basePath="/warehouse/outgoing"
                mode="active"
                emptyMessage="Belum ada perintah muat. Tunggu Sales membuat Surat Jalan."
            />
        </div>
    );
}
