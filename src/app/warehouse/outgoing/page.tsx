import { getOpenDeliveryOrders } from '@/actions/inventory/deliveries';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DeliveryOrderTable } from '@/components/sales/DeliveryOrderTable';
import { serializeData } from '@/lib/utils/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { History, Info } from 'lucide-react';
import Link from 'next/link';
import { warehouseLabels } from '@/lib/labels';

export default async function WarehouseOutgoingPage() {
    const result = await getOpenDeliveryOrders();
    const openOrders = result.success && result.data
        ? serializeData(result.data)
        : [];

    return (
        <div className="flex flex-col space-y-6 p-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        {warehouseLabels.outgoing}
                    </h1>
                    <p className="text-muted-foreground">
                        Perintah muat (Surat Jalan) siap atau sedang diproses
                        gudang.
                    </p>
                </div>
                <Button variant="outline" asChild>
                    <Link href="/warehouse/outgoing/history">
                        <History className="mr-2 h-4 w-4" />
                        {warehouseLabels.outgoingHistory}
                    </Link>
                </Button>
            </div>

            <Alert className="bg-background border-blue-500/20 text-blue-600 dark:text-blue-400">
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                    <strong>Alur:</strong> Surat Jalan di bawah adalah perintah
                    muat. Mulai muat → cek qty fisik vs perintah (verifikasi) →
                    Tandai Dikirim (potong stok). SJ dibuat di Sales; gudang
                    mengeksekusi di sini.
                </AlertDescription>
            </Alert>

            <Card>
                <CardHeader>
                    <CardTitle>Perintah Muat ({openOrders.length})</CardTitle>
                </CardHeader>
                <CardContent>
                    {openOrders.length === 0 ? (
                        <div className="text-center p-8 text-muted-foreground border rounded-lg border-dashed">
                            Belum ada perintah muat. Tunggu Sales membuat Surat
                            Jalan.
                        </div>
                    ) : (
                        <DeliveryOrderTable
                            initialData={openOrders}
                            basePath="/warehouse/outgoing"
                            mode="active"
                        />
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
