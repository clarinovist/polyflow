'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ImageIcon, Navigation, Pencil } from 'lucide-react';
import { formatRupiah } from '@/lib/utils/utils';
import { CustomerDialog } from './CustomerDialog';
import { SalesOrderTable } from '@/components/sales/SalesOrderTable';
import { CustomerProductPricesManager } from './CustomerProductPricesManager';
import { CustomerInvoicesTab } from './360/CustomerInvoicesTab';
import { CustomerReturnsTab } from './360/CustomerReturnsTab';
import { CustomerDeliveriesTab } from './360/CustomerDeliveriesTab';
import { CustomerQuotationsTab } from './360/CustomerQuotationsTab';
import { CustomerVisitsTab } from './360/CustomerVisitsTab';
import { CustomerAnalyticsTab } from './360/CustomerAnalyticsTab';
import {
    CustomerBarterSettings,
    type CustomerBarterSettingsValue,
} from './CustomerBarterSettings';
import {
    PartnerDetailLayout,
    PartnerProfileSection,
    PartnerProfileField,
} from '@/components/shared/partner-detail/PartnerDetailLayout';
import {
    PartnerDetailTabs,
    PartnerOverviewLinks,
    type PartnerDetailTabGroup,
} from '@/components/shared/partner-detail/PartnerDetailTabs';
import { usePartnerDetailTab } from '@/components/shared/partner-detail/use-partner-detail-tab';
import type {
    Customer,
    SalesOrder,
    Location,
    Product,
    ProductVariant,
} from '@prisma/client';

export type SerializedCustomer = Omit<
    Customer,
    | 'creditLimit'
    | 'discountPercent'
    | 'maxDiscountPercent'
    | 'latitude'
    | 'longitude'
> & {
    creditLimit: number | null;
    discountPercent: number | null;
    maxDiscountPercent: number | null;
    latitude: number | null;
    longitude: number | null;
};

type SerializedSalesOrder = Omit<SalesOrder, 'totalAmount'> & {
    totalAmount: number | null;
    customer: SerializedCustomer | null;
    sourceLocation: Location | null;
    _count: { items: number };
};

type SerializedProductVariant = Omit<
    ProductVariant,
    | 'price'
    | 'buyPrice'
    | 'sellPrice'
    | 'conversionFactor'
    | 'minStockAlert'
    | 'reorderPoint'
    | 'reorderQuantity'
    | 'standardCost'
> & {
    price: number | null;
    buyPrice: number | null;
    sellPrice: number | null;
    conversionFactor: number;
    minStockAlert: number | null;
    reorderPoint: number | null;
    reorderQuantity: number | null;
    standardCost: number | null;
    product: Product;
};

type SerializedCustomerProductPrice = {
    id: string;
    customerId: string;
    productVariantId: string;
    unitPrice: number;
    isActive: boolean;
    notes: string | null;
    productVariant: SerializedProductVariant;
};

interface CustomerDetailClientProps {
    customer: SerializedCustomer;
    salesOrders: SerializedSalesOrder[];
    customerProductPrices: SerializedCustomerProductPrice[];
    products: SerializedProductVariant[];
    barterSettings?: CustomerBarterSettingsValue;
}

const groups: PartnerDetailTabGroup[] = [
    {
        value: 'overview',
        label: 'Ringkasan',
        tabs: [{ value: 'overview', label: 'Ringkasan' }],
    },
    {
        value: 'transactions',
        label: 'Transaksi',
        tabs: [
            { value: 'history', label: 'Pesanan penjualan' },
            { value: 'deliveries', label: 'Pengiriman' },
            { value: 'returns', label: 'Retur' },
            { value: 'quotations', label: 'Penawaran' },
        ],
    },
    {
        value: 'finance',
        label: 'Keuangan',
        tabs: [{ value: 'invoices', label: 'Invoice' }],
    },
    {
        value: 'products',
        label: 'Harga Produk',
        tabs: [{ value: 'prices', label: 'Harga Produk' }],
    },
    {
        value: 'activity',
        label: 'Aktivitas',
        tabs: [
            { value: 'visits', label: 'Kunjungan' },
            { value: 'analytics', label: 'Analitik' },
        ],
    },
];

export function CustomerDetailClient({
    customer,
    salesOrders,
    customerProductPrices,
    products,
    barterSettings,
}: CustomerDetailClientProps) {
    const [activeTab, selectTab] = usePartnerDetailTab(groups);
    const profile = (
        <>
            <PartnerProfileSection title="Kontak">
                <dl className="space-y-3">
                    <PartnerProfileField label="Email">
                        {customer.email || 'Belum diisi'}
                    </PartnerProfileField>
                    <PartnerProfileField label="Telepon">
                        {customer.phone || 'Belum diisi'}
                    </PartnerProfileField>
                </dl>
            </PartnerProfileSection>
            <PartnerProfileSection title="Alamat & lokasi">
                {customer.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={customer.photoUrl}
                        alt={`Foto toko ${customer.name}`}
                        className="max-h-40 w-full rounded-lg border object-cover"
                    />
                ) : (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="flex size-9 items-center justify-center rounded-md border border-dashed">
                            <ImageIcon className="size-4" aria-hidden="true" />
                        </span>
                        Belum ada foto
                    </div>
                )}
                <dl className="space-y-3">
                    {(customer.province ||
                        customer.city ||
                        customer.district ||
                        customer.village) && (
                        <PartnerProfileField label="Alamat terstruktur">
                            {[
                                customer.village,
                                customer.district,
                                customer.city,
                                customer.province,
                            ]
                                .filter(Boolean)
                                .join(', ')}
                        </PartnerProfileField>
                    )}
                    <PartnerProfileField label="Alamat tagihan">
                        {customer.billingAddress || '-'}
                    </PartnerProfileField>
                    <PartnerProfileField label="Alamat kirim">
                        {customer.shippingAddress || '-'}
                    </PartnerProfileField>
                </dl>
                {customer.latitude && customer.longitude ? (
                    <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">
                            Koordinat
                        </p>
                        <p className="font-mono text-xs">
                            {Number(customer.latitude).toFixed(6)},{' '}
                            {Number(customer.longitude).toFixed(6)}
                        </p>
                        <a
                            href={`https://www.google.com/maps?q=${customer.latitude},${customer.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-9 items-center gap-1 text-xs text-blue-700 hover:underline dark:text-blue-300"
                        >
                            <Navigation className="size-3" aria-hidden="true" />{' '}
                            Navigasi
                        </a>
                    </div>
                ) : null}
            </PartnerProfileSection>
            <PartnerProfileSection title="Ketentuan bisnis">
                <dl className="space-y-3">
                    <PartnerProfileField label="NPWP">
                        {customer.taxId || '-'}
                    </PartnerProfileField>
                    <PartnerProfileField label="Termin">
                        {customer.paymentTermDays
                            ? `${customer.paymentTermDays} Hari`
                            : '-'}
                    </PartnerProfileField>
                    <PartnerProfileField label="Limit kredit">
                        {customer.creditLimit
                            ? formatRupiah(customer.creditLimit)
                            : '-'}
                    </PartnerProfileField>
                    <PartnerProfileField label="Diskon">
                        {customer.discountPercent
                            ? `${customer.discountPercent}%`
                            : '-'}
                    </PartnerProfileField>
                </dl>
            </PartnerProfileSection>
            {customer.notes && (
                <PartnerProfileSection title="Catatan">
                    <p className="whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
                        {customer.notes}
                    </p>
                </PartnerProfileSection>
            )}
        </>
    );
    const orderHistory = (
        <Card className="min-w-0 shadow-none">
            <CardHeader>
                <CardTitle className="text-base">
                    Riwayat pesanan penjualan
                </CardTitle>
            </CardHeader>
            <CardContent className="min-w-0 overflow-x-auto">
                <SalesOrderTable initialData={salesOrders} />
            </CardContent>
        </Card>
    );

    return (
        <PartnerDetailLayout
            kind="Customer"
            name={customer.name}
            code={customer.code}
            isActive={customer.isActive}
            backHref="/sales/customers"
            profile={profile}
            actions={
                <CustomerDialog
                    mode="edit"
                    trigger={
                        <Button variant="outline" className="min-h-10 gap-2">
                            <Pencil className="size-3.5" aria-hidden="true" />
                            Edit profil
                        </Button>
                    }
                    initialData={{
                        ...customer,
                        creditLimit: customer.creditLimit
                            ? Number(customer.creditLimit)
                            : null,
                        discountPercent: customer.discountPercent
                            ? Number(customer.discountPercent)
                            : null,
                        latitude: customer.latitude
                            ? Number(customer.latitude)
                            : null,
                        longitude: customer.longitude
                            ? Number(customer.longitude)
                            : null,
                    }}
                />
            }
        >
            <PartnerDetailTabs
                groups={groups}
                value={activeTab}
                onValueChange={selectTab}
            >
                <div className="min-w-0 space-y-6">
                    {activeTab === 'overview' && (
                        <>
                            <div>
                                <h2 className="text-lg font-semibold tracking-tight">
                                    Sekilas hubungan bisnis
                                </h2>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Riwayat penjualan, harga khusus, dan akses
                                    ke invoice customer.
                                </p>
                            </div>
                            <PartnerOverviewLinks
                                onSelect={selectTab}
                                items={[
                                    {
                                        value: 'history',
                                        label: 'Pesanan penjualan',
                                        description:
                                            'Lihat dokumen dan status pesanan customer.',
                                    },
                                    {
                                        value: 'invoices',
                                        label: 'Invoice customer',
                                        description:
                                            'Periksa tagihan melalui bagian Keuangan.',
                                    },
                                    {
                                        value: 'prices',
                                        label: 'Harga produk',
                                        description:
                                            'Kelola harga khusus per varian produk.',
                                    },
                                ]}
                            />
                            {orderHistory}
                            <CustomerAnalyticsTab customerId={customer.id} />
                        </>
                    )}
                    {activeTab === 'history' && orderHistory}
                    {activeTab === 'invoices' && (
                        <>
                            <CustomerInvoicesTab customerId={customer.id} />
                            {barterSettings && (
                                <CustomerBarterSettings
                                    customerId={customer.id}
                                    initialValue={barterSettings}
                                />
                            )}
                        </>
                    )}
                    {activeTab === 'returns' && (
                        <CustomerReturnsTab customerId={customer.id} />
                    )}
                    {activeTab === 'deliveries' && (
                        <CustomerDeliveriesTab customerId={customer.id} />
                    )}
                    {activeTab === 'quotations' && (
                        <CustomerQuotationsTab customerId={customer.id} />
                    )}
                    {activeTab === 'prices' && (
                        <Card className="min-w-0 shadow-none">
                            <CardHeader>
                                <CardTitle className="text-base">
                                    Harga Produk Customer
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="min-w-0 overflow-x-auto">
                                <CustomerProductPricesManager
                                    customerId={customer.id}
                                    prices={customerProductPrices}
                                    products={products}
                                />
                            </CardContent>
                        </Card>
                    )}
                    {activeTab === 'visits' && (
                        <CustomerVisitsTab customerId={customer.id} />
                    )}
                    {activeTab === 'analytics' && (
                        <CustomerAnalyticsTab customerId={customer.id} />
                    )}
                </div>
            </PartnerDetailTabs>
        </PartnerDetailLayout>
    );
}
