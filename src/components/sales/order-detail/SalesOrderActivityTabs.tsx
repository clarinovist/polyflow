import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { History, Route } from 'lucide-react';
import { EntityStatusTimeline } from '@/components/shared/EntityStatusTimeline';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { SerializedSalesOrder } from '../sales-order-types';

interface SalesOrderActivityTabsProps {
    order: SerializedSalesOrder;
    isMaklonOrder: boolean;
}

export function SalesOrderActivityTabs({
    order,
    isMaklonOrder,
}: SalesOrderActivityTabsProps) {
    return (
        <section aria-labelledby="order-activity-title" className="space-y-3">
            <div>
                <h2 id="order-activity-title" className="text-lg font-semibold">
                    Aktivitas Pesanan
                </h2>
                <p className="text-sm text-muted-foreground">
                    Aktivitas operasional dipisahkan dari audit perubahan status.
                </p>
            </div>
            <Tabs defaultValue="operations">
                <TabsList className="grid h-auto w-full grid-cols-2 sm:w-[360px]">
                    <TabsTrigger value="operations" className="min-h-11">
                        <Route className="mr-2 h-4 w-4" /> Operasional
                    </TabsTrigger>
                    <TabsTrigger value="audit" className="min-h-11">
                        <History className="mr-2 h-4 w-4" /> Audit Status
                    </TabsTrigger>
                </TabsList>
                <TabsContent value="operations" className="mt-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">
                                {isMaklonOrder
                                    ? 'Riwayat Penutupan Jasa'
                                    : 'Riwayat Pengiriman'}
                            </CardTitle>
                            <CardDescription>
                                {isMaklonOrder
                                    ? 'Progres penutupan untuk order jasa maklon'
                                    : 'Mutasi stok terkait pesanan ini'}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {order.movements.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    {isMaklonOrder
                                        ? 'Belum ada mutasi stok penutupan jasa. Konsumsi bahan dilacak dari eksekusi produksi.'
                                        : 'Belum ada pengiriman.'}
                                </p>
                            ) : (
                                <ol className="space-y-4 border-l border-muted-foreground/20 pl-4">
                                    {order.movements.map((movement) => (
                                        <li key={movement.id} className="text-sm">
                                            <p className="font-medium">
                                                {isMaklonOrder
                                                    ? 'Mutasi penutupan jasa ' + Number(movement.quantity) + ' unit'
                                                    : 'Pengiriman ' + Number(movement.quantity) + ' unit'}
                                            </p>
                                            <time className="text-xs text-muted-foreground">
                                                {format(
                                                    new Date(movement.createdAt),
                                                    'd MMM yyyy, HH:mm',
                                                    { locale: id },
                                                )}
                                            </time>
                                        </li>
                                    ))}
                                </ol>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
                <TabsContent value="audit" className="mt-4">
                    <EntityStatusTimeline
                        entityType="SalesOrder"
                        entityId={order.id}
                    />
                </TabsContent>
            </Tabs>
        </section>
    );
}
