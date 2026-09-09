'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, Star } from 'lucide-react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { LinkProductDialog } from './LinkProductDialog';
import { UnlinkProductButton } from './UnlinkProductButton';
import { formatRupiah } from '@/lib/utils/utils';
import { SupplierOrdersTab } from './360/SupplierOrdersTab';
import { SupplierReturnsTab } from './360/SupplierReturnsTab';
import { SupplierPaymentsTab } from './360/SupplierPaymentsTab';
import { SupplierPerformanceTab } from './360/SupplierPerformanceTab';
import { SupplierAnalyticsTab } from './360/SupplierAnalyticsTab';
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
import type { SupplierProductSummary } from '@/services/purchasing/supplier-products-service';

interface Props {
    supplier: {
        id: string;
        name: string;
        code?: string | null;
        isActive: boolean;
        email?: string | null;
        phone?: string | null;
        address?: string | null;
        taxId?: string | null;
        paymentTermDays?: number | null;
        bankName?: string | null;
        bankAccount?: string | null;
        notes?: string | null;
    };
    supplierProducts: SupplierProductSummary[];
    initialTab: string;
}

export function Supplier360Tabs({
    supplier,
    supplierProducts,
    initialTab,
}: Props) {
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
                { value: 'orders', label: 'Pesanan pembelian' },
                { value: 'returns', label: 'Retur' },
            ],
        },
        {
            value: 'finance',
            label: 'Keuangan',
            tabs: [{ value: 'payments', label: 'Utang' }],
        },
        {
            value: 'products',
            label: `Produk (${supplierProducts.length})`,
            tabs: [{ value: 'products', label: 'Produk' }],
        },
        {
            value: 'insights',
            label: 'Kinerja',
            tabs: [
                { value: 'performance', label: 'Performa' },
                { value: 'analytics', label: 'Analitik' },
            ],
        },
    ];
    const [activeTab, selectTab] = usePartnerDetailTab(groups, initialTab);

    const profile = (
        <>
            <PartnerProfileSection title="Kontak">
                <dl className="space-y-3">
                    <PartnerProfileField label="Email">
                        {supplier.email || 'Belum diisi'}
                    </PartnerProfileField>
                    <PartnerProfileField label="Telepon">
                        {supplier.phone || 'Belum diisi'}
                    </PartnerProfileField>
                </dl>
            </PartnerProfileSection>
            <PartnerProfileSection title="Alamat">
                <p className="whitespace-pre-line text-sm leading-relaxed">
                    {supplier.address || 'Belum diisi'}
                </p>
            </PartnerProfileSection>
            <PartnerProfileSection title="Ketentuan bisnis">
                <dl className="space-y-3">
                    <PartnerProfileField label="NPWP">
                        {supplier.taxId || '-'}
                    </PartnerProfileField>
                    <PartnerProfileField label="Termin">
                        {supplier.paymentTermDays
                            ? `${supplier.paymentTermDays} Hari`
                            : '-'}
                    </PartnerProfileField>
                </dl>
            </PartnerProfileSection>
            <PartnerProfileSection title="Rekening bank">
                {supplier.bankName ? (
                    <div className="space-y-1">
                        <p>{supplier.bankName}</p>
                        {supplier.bankAccount && (
                            <p className="font-mono text-xs text-muted-foreground">
                                {supplier.bankAccount}
                            </p>
                        )}
                    </div>
                ) : (
                    <p className="text-muted-foreground">Belum diisi</p>
                )}
            </PartnerProfileSection>
            {supplier.notes && (
                <PartnerProfileSection title="Catatan">
                    <p className="whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
                        {supplier.notes}
                    </p>
                </PartnerProfileSection>
            )}
        </>
    );

    return (
        <PartnerDetailLayout
            kind="Supplier"
            name={supplier.name}
            code={supplier.code}
            isActive={supplier.isActive}
            backHref="/purchasing/suppliers"
            profile={profile}
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
                                    Produk, riwayat pembelian, dan akses ke
                                    tagihan supplier.
                                </p>
                            </div>
                            <PartnerOverviewLinks
                                onSelect={selectTab}
                                items={[
                                    {
                                        value: 'products',
                                        label: 'Produk / Varian',
                                        count: supplierProducts.length,
                                        description:
                                            'Gabungan tautan manual dan riwayat barang masuk.',
                                    },
                                    {
                                        value: 'orders',
                                        label: 'Pesanan pembelian',
                                        description:
                                            'Lihat dokumen dan status penerimaan barang.',
                                    },
                                    {
                                        value: 'payments',
                                        label: 'Utang supplier',
                                        description:
                                            'Periksa tagihan dan pembayaran di Keuangan.',
                                    },
                                ]}
                            />
                            <SupplierOrdersTab supplierId={supplier.id} />
                            <SupplierAnalyticsTab supplierId={supplier.id} />
                        </>
                    )}
                    {activeTab === 'products' && (
                        <Card className="min-w-0 shadow-none">
                            <CardHeader className="flex flex-wrap items-start justify-between gap-4 sm:flex-row">
                                <div className="min-w-0 flex-1">
                                    <CardTitle className="text-base">
                                        Produk yang Disuplai
                                    </CardTitle>
                                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                                        Gabungan tautan manual dan riwayat
                                        barang masuk, termasuk pembelian dari
                                        nota. Setiap varian dihitung sekali.
                                        Melepas tautan manual tidak menghapus
                                        riwayat barang masuk.
                                    </p>
                                </div>
                                <LinkProductDialog
                                    supplierId={supplier.id}
                                    supplierName={supplier.name}
                                />
                            </CardHeader>
                            <CardContent className="min-w-0">
                                <p className="mb-3 text-xs text-muted-foreground lg:hidden">
                                    Geser tabel untuk melihat kolom lainnya →
                                </p>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>
                                                Produk / Varian
                                            </TableHead>
                                            <TableHead>SKU</TableHead>
                                            <TableHead>Harga</TableHead>
                                            <TableHead>Lead Time</TableHead>
                                            <TableHead>Min</TableHead>
                                            <TableHead className="w-[100px]">
                                                <span className="sr-only">
                                                    Aksi
                                                </span>
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {supplierProducts.length === 0 ? (
                                            <TableRow>
                                                <TableCell
                                                    colSpan={6}
                                                    className="py-8 text-center text-muted-foreground"
                                                >
                                                    Belum ada tautan produk atau
                                                    riwayat barang masuk dari
                                                    supplier ini.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            supplierProducts.map((sp) => (
                                                <TableRow key={sp.id}>
                                                    <TableCell>
                                                        <div className="flex flex-col">
                                                            <span className="flex items-center gap-1 font-medium">
                                                                {
                                                                    sp
                                                                        .productVariant
                                                                        .product
                                                                        .name
                                                                }
                                                                {sp.isPreferred && (
                                                                    <Star
                                                                        className="size-3 fill-yellow-400 text-yellow-500"
                                                                        aria-label="Supplier pilihan"
                                                                    />
                                                                )}
                                                            </span>
                                                            <span className="text-xs text-muted-foreground">
                                                                {
                                                                    sp
                                                                        .productVariant
                                                                        .name
                                                                }
                                                            </span>
                                                            <div className="mt-1 flex gap-1">
                                                                {sp.linkId && (
                                                                    <Badge variant="outline">
                                                                        Manual
                                                                    </Badge>
                                                                )}
                                                                {sp.hasReceiptHistory && (
                                                                    <Badge variant="secondary">
                                                                        Barang
                                                                        masuk
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="font-mono text-xs">
                                                        {
                                                            sp.productVariant
                                                                .skuCode
                                                        }
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="whitespace-nowrap tabular-nums">
                                                            {formatRupiah(
                                                                sp.unitPrice ??
                                                                    sp.lastReceiptUnitCost,
                                                            )}
                                                        </div>
                                                        {sp.unitPrice == null &&
                                                            sp.hasReceiptHistory && (
                                                                <span className="text-xs text-muted-foreground">
                                                                    Biaya
                                                                    penerimaan
                                                                    terakhir
                                                                </span>
                                                            )}
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-1">
                                                            <Clock
                                                                className="size-3 text-muted-foreground"
                                                                aria-hidden="true"
                                                            />
                                                            {sp.leadTimeDays !=
                                                            null
                                                                ? `${sp.leadTimeDays} hari`
                                                                : '-'}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        {sp.minOrderQty != null
                                                            ? sp.minOrderQty.toString()
                                                            : '-'}
                                                    </TableCell>
                                                    <TableCell>
                                                        {sp.linkId && (
                                                            <UnlinkProductButton
                                                                id={sp.linkId}
                                                            />
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    )}
                    {activeTab === 'orders' && (
                        <SupplierOrdersTab supplierId={supplier.id} />
                    )}
                    {activeTab === 'returns' && (
                        <SupplierReturnsTab supplierId={supplier.id} />
                    )}
                    {activeTab === 'payments' && (
                        <SupplierPaymentsTab supplierId={supplier.id} />
                    )}
                    {activeTab === 'performance' && (
                        <SupplierPerformanceTab supplierId={supplier.id} />
                    )}
                    {activeTab === 'analytics' && (
                        <SupplierAnalyticsTab supplierId={supplier.id} />
                    )}
                </div>
            </PartnerDetailTabs>
        </PartnerDetailLayout>
    );
}
