import Link from 'next/link';
import {
    ShoppingCart,
    Package,
    Truck,
    Warehouse,
    Receipt,
    ArrowRight,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const hubs = [
    {
        heading: 'Operasi',
        items: [
            {
                href: '/sales/orders',
                icon: ShoppingCart,
                title: 'Sales Order',
                description:
                    'Buat dan pantau order penjualan dari pelanggan distributor',
            },
            {
                href: '/purchasing/orders',
                icon: Package,
                title: 'Order Pembelian (PO)',
                description:
                    'Pembelian barang dari principal/supplier untuk stok',
            },
            {
                href: '/sales/deliveries',
                icon: Truck,
                title: 'Surat Jalan',
                description: 'Proses pengiriman barang ke pelanggan',
            },
        ],
    },
    {
        heading: 'Stok & Keuangan',
        items: [
            {
                href: '/warehouse/inventory',
                icon: Warehouse,
                title: 'Stok',
                description: 'Posisi stok antar gudang dan mutasi barang',
            },
            {
                href: '/sales/invoices',
                icon: Receipt,
                title: 'Invoice & Piutang',
                description: 'Penagihan, piutang jatuh tempo, dan pelunasan',
            },
        ],
    },
];

export default function DistributionDashboardPage() {
    return (
        <div className="flex flex-col space-y-8">
            <PageHeader
                title="Portal Distributor"
                description="Hub operasional distribusi: beli dari principal, jual ke pelanggan, kirim, tagih."
            />

            {hubs.map((group) => (
                <section key={group.heading} className="space-y-3">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                        {group.heading}
                    </h2>
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {group.items.map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className="group"
                            >
                                <Card className="h-full transition-colors hover:border-sky-300 hover:bg-sky-50/40 dark:hover:border-sky-800 dark:hover:bg-sky-950/20">
                                    <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                                        <div className="flex items-center gap-3">
                                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                                                <item.icon className="h-5 w-5" />
                                            </div>
                                            <CardTitle className="text-base font-semibold">
                                                {item.title}
                                            </CardTitle>
                                        </div>
                                        <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-sm text-muted-foreground">
                                            {item.description}
                                        </p>
                                    </CardContent>
                                </Card>
                            </Link>
                        ))}
                    </div>
                </section>
            ))}
        </div>
    );
}
