import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Warehouse, Plus } from 'lucide-react';
import { getDeliveryOrdersPage } from '@/actions/inventory/deliveries';
import { DeliveryWorkbenchControls } from '@/components/sales/DeliveryWorkbenchControls';
import { CreateDeliveryOrderDialog } from '@/components/sales/CreateDeliveryOrderDialog';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { serializeData } from '@/lib/utils/utils';
import { salesLabels } from '@/lib/labels';
import { canAccessWarehouseResource } from '@/lib/tools/auth-checks';
import {
    parseDeliveryListSearchParams,
    type DeliveryListSearchParams,
} from '@/lib/sales/delivery-list';

export default async function SalesDeliveriesPage({
    searchParams,
}: {
    searchParams: Promise<DeliveryListSearchParams>;
}) {
    const params = await searchParams;
    const parsed = parseDeliveryListSearchParams(params);
    if (parsed.needsRedirect) {
        const query = parsed.canonical.toString();
        redirect(query ? '/sales/deliveries?' + query : '/sales/deliveries');
    }

    const [result, canAccessWarehouseOutgoing] = await Promise.all([
        getDeliveryOrdersPage(parsed.query),
        canAccessWarehouseResource('/warehouse/outgoing'),
    ]);

    if (!result.success) {
        return (
            <div className="space-y-4 p-4 md:p-6">
                <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
                    {salesLabels.deliveryOrders}
                </h1>
                <p role="alert" className="text-destructive">
                    {result.error || 'Gagal memuat Surat Jalan.'}
                </p>
                <p className="text-sm text-muted-foreground">
                    Muat ulang halaman untuk mencoba lagi. Data tidak dianggap
                    kosong.
                </p>
            </div>
        );
    }

    const data = result.data;
    if (data.meta.page !== parsed.query.page) {
        const canonical = new URLSearchParams(parsed.canonical.toString());
        if (data.meta.page === 1) canonical.delete('page');
        else canonical.set('page', String(data.meta.page));
        const query = canonical.toString();
        redirect(query ? '/sales/deliveries?' + query : '/sales/deliveries');
    }

    return (
        <div className="flex min-w-0 flex-col gap-6 p-4 md:p-6">
            <PageHeader
                title={salesLabels.deliveryOrders}
                description={salesLabels.deliveryOrdersDesc}
                actions={
                    <>
                        {canAccessWarehouseOutgoing && (
                            <Button variant="outline" asChild>
                                <Link href="/warehouse/outgoing">
                                    <Warehouse
                                        aria-hidden="true"
                                        className="h-4 w-4"
                                    />
                                    Portal Gudang
                                </Link>
                            </Button>
                        )}
                        {canAccessWarehouseOutgoing && (
                            <CreateDeliveryOrderDialog
                                triggerLabel="Buat Surat Jalan"
                                triggerClassName="min-h-11"
                            />
                        )}
                    </>
                }
            />

            <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">
                <p className="font-medium">Scope daftar</p>
                <p className="mt-1 text-muted-foreground">
                    Surat Jalan PENDING/LOADING tetap disertakan walau
                    tanggalnya di luar periode agar antrean aktif tidak hilang.
                </p>
            </div>

            <DeliveryWorkbenchControls
                statusCounts={data.statusCounts}
                group={parsed.query.workflowGroup}
                status={parsed.query.status}
                initialSearch={parsed.query.search}
                initialStartDate={parsed.query.startDate
                    .toISOString()
                    .slice(0, 10)}
                initialEndDate={parsed.query.endDate.toISOString().slice(0, 10)}
                customer={parsed.query.customerId}
                location={parsed.query.sourceLocationId}
                rows={
                    serializeData(
                        data.items,
                    ) as unknown as React.ComponentProps<
                        typeof DeliveryWorkbenchControls
                    >['rows']
                }
                meta={data.meta}
                filterOptions={data.filterOptions}
            />

            {data.meta.total === 0 && canAccessWarehouseOutgoing && (
                <Button asChild className="self-start">
                    <Link href="/sales/orders">
                        <Plus aria-hidden="true" className="h-4 w-4" />
                        Pilih Sales Order
                    </Link>
                </Button>
            )}
        </div>
    );
}
