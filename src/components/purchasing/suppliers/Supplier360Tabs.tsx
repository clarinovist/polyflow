'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronLeft, Building2, Phone, MapPin, CreditCard, Mail, Package, DollarSign, Clock, Star } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Link from 'next/link';
import { LinkProductDialog } from '@/components/purchasing/suppliers/LinkProductDialog';
import { UnlinkProductButton } from '@/components/purchasing/suppliers/UnlinkProductButton';
import { formLabels } from '@/lib/labels';
import { SupplierOrdersTab } from './360/SupplierOrdersTab';
import { SupplierReturnsTab } from './360/SupplierReturnsTab';
import { SupplierPaymentsTab } from './360/SupplierPaymentsTab';
import { SupplierPerformanceTab } from './360/SupplierPerformanceTab';
import { SupplierAnalyticsTab } from './360/SupplierAnalyticsTab';

interface SupplierProduct {
  id: string; isPreferred: boolean; unitPrice: number | null; leadTimeDays: number | null; minOrderQty: number | null;
  productVariant: { name: string; skuCode: string; product: { name: string } };
}

type Tab = 'overview' | 'products' | 'orders' | 'returns' | 'payments' | 'performance' | 'analytics';

interface Props {
  supplier: { id: string; name: string; code?: string | null; isActive: boolean; email?: string | null; phone?: string | null; address?: string | null; taxId?: string | null; paymentTermDays?: number | null; bankName?: string | null; bankAccount?: string | null; notes?: string | null; };
  supplierProducts: SupplierProduct[];
  initialTab: string;
}

export function Supplier360Tabs({ supplier, supplierProducts, initialTab }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>((initialTab as Tab) || 'overview');
  const router = useRouter();
  const handleTabChange = useCallback((v: string) => {
    setActiveTab(v as Tab);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', v);
    router.replace(url.pathname + url.search, { scroll: false });
  }, [router]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/purchasing/suppliers"><Button variant="outline" size="icon"><ChevronLeft className="h-4 w-4" /></Button></Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{supplier.name}</h1>
          <div className="flex gap-2 mt-1">
            <Badge variant="outline">{supplier.code || 'Tanpa Kode'}</Badge>
            <Badge variant={supplier.isActive ? 'default' : 'secondary'}>{supplier.isActive ? 'Aktif' : 'Nonaktif'}</Badge>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="flex h-auto gap-1 overflow-x-auto scrollbar-none justify-start">
          <TabsTrigger value="overview" className="text-xs shrink-0">Ringkas</TabsTrigger>
          <TabsTrigger value="products" className="text-xs shrink-0">Produk ({supplierProducts.length})</TabsTrigger>
          <TabsTrigger value="orders" className="text-xs shrink-0">Orders</TabsTrigger>
          <TabsTrigger value="returns" className="text-xs shrink-0">Retur</TabsTrigger>
          <TabsTrigger value="payments" className="text-xs shrink-0">Hutang</TabsTrigger>
          <TabsTrigger value="performance" className="text-xs shrink-0">Performa</TabsTrigger>
          <TabsTrigger value="analytics" className="text-xs shrink-0">Analitik</TabsTrigger>
        </TabsList>

        <div className="mt-4 space-y-6">
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> Ikhtisar</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {supplier.email && <div className="flex items-center gap-3"><div className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg"><Mail className="h-4 w-4 text-muted-foreground" /></div><div><p className="text-xs text-muted-foreground">Email</p><p className="font-medium text-sm break-all">{supplier.email}</p></div></div>}
                  {supplier.phone && <div className="flex items-center gap-3"><div className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg"><Phone className="h-4 w-4 text-muted-foreground" /></div><div><p className="text-xs text-muted-foreground">{formLabels.phone}</p><p className="font-medium">{supplier.phone}</p></div></div>}
                  {supplier.address && <div className="flex items-center gap-3"><div className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg"><MapPin className="h-4 w-4 text-muted-foreground" /></div><div><p className="text-xs text-muted-foreground">{formLabels.address}</p><p className="font-medium text-sm">{supplier.address}</p></div></div>}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" /> Detail Keuangan</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div><p className="text-xs text-muted-foreground">NPWP</p><p className="font-medium">{supplier.taxId || '-'}</p></div>
                    <div><p className="text-xs text-muted-foreground">Termin</p><p className="font-medium">{supplier.paymentTermDays ? `${supplier.paymentTermDays} Hari` : '-'}</p></div>
                  </div>
                  <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground mb-1">Bank</p>
                    <div className="text-sm">{supplier.bankName ? <><span className="font-medium">{supplier.bankName}</span>{supplier.bankAccount && <span className="text-muted-foreground font-mono ml-2">{supplier.bankAccount}</span>}</> : '-'}</div>
                  </div>
                  {supplier.notes && <div className="pt-2 border-t"><p className="text-xs text-muted-foreground mb-1">{formLabels.notes}</p><p className="text-sm italic">{supplier.notes}</p></div>}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Produk</CardTitle></CardHeader>
                <CardContent className="flex items-center justify-center py-6"><div className="text-center"><p className="text-4xl font-bold">{supplierProducts.length}</p><p className="text-sm text-muted-foreground">Produk Aktif</p></div></CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'products' && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between"><div><CardTitle className="flex items-center gap-2"><Package className="h-5 w-5" /> Produk yang Disuplai</CardTitle></div><LinkProductDialog supplierId={supplier.id} supplierName={supplier.name} /></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Produk / Varian</TableHead><TableHead>SKU</TableHead><TableHead>Harga</TableHead><TableHead>Lead Time</TableHead><TableHead>Min</TableHead><TableHead className="w-[100px]"></TableHead></TableRow></TableHeader>
                  <TableBody>
                    {supplierProducts.length===0 ? <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Belum ada produk.</TableCell></TableRow> :
                    supplierProducts.map((sp) => (
                      <TableRow key={sp.id}><TableCell><div className="flex flex-col"><span className="font-medium flex items-center gap-1">{sp.productVariant.product.name}{sp.isPreferred && <Star className="h-3 w-3 fill-yellow-400 text-yellow-500" />}</span><span className="text-xs text-muted-foreground">{sp.productVariant.name}</span></div></TableCell>
                      <TableCell className="font-mono text-xs">{sp.productVariant.skuCode}</TableCell>
                      <TableCell><div className="flex items-center gap-1"><DollarSign className="h-3 w-3 text-muted-foreground" />{sp.unitPrice ? sp.unitPrice.toString() : '-'}</div></TableCell>
                      <TableCell><div className="flex items-center gap-1"><Clock className="h-3 w-3 text-muted-foreground" />{sp.leadTimeDays ? `${sp.leadTimeDays} hari` : '-'}</div></TableCell>
                      <TableCell>{sp.minOrderQty ? sp.minOrderQty.toString() : '-'}</TableCell>
                      <TableCell><UnlinkProductButton id={sp.id} /></TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {activeTab === 'orders' && <SupplierOrdersTab supplierId={supplier.id} />}
          {activeTab === 'returns' && <SupplierReturnsTab supplierId={supplier.id} />}
          {activeTab === 'payments' && <SupplierPaymentsTab supplierId={supplier.id} />}
          {activeTab === 'performance' && <SupplierPerformanceTab supplierId={supplier.id} />}
          {activeTab === 'analytics' && <SupplierAnalyticsTab supplierId={supplier.id} />}
        </div>
      </Tabs>
    </div>
  );
}
