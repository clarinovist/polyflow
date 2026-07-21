'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Package, Warehouse, History, Layers, FileClock, Beaker, Bookmark, TrendingUp, ListOrdered } from 'lucide-react';
import Link from 'next/link';
import { formatQuantity } from '@/lib/utils/utils';
import { StockLedgerClient } from '@/components/warehouse/StockLedgerClient';
import { ProductStockByLocationTab } from './ProductStockByLocationTab';
import { ProductBatchesTab } from './ProductBatchesTab';
import { ProductBomTab } from './ProductBomTab';
import { ProductCostHistoryTab } from './ProductCostHistoryTab';
import { ProductReservationsTab } from './ProductReservationsTab';
import { ProductMovementsTab } from './ProductMovementsTab';

type Tab = 'overview' | 'stock' | 'ledger' | 'batches' | 'bom' | 'cost' | 'reservations' | 'movements';

interface Props {
  productVariantId: string;
  ledgerData: ComponentProps<typeof StockLedgerClient>['ledgerData'];
  locations: ComponentProps<typeof StockLedgerClient>['locations'];
  overview?: {
    variant: { id: string; name: string; skuCode: string; primaryUnit: string; productType?: string; costingMethod?: string; standardCost?: { toNumber(): number } | number | null; minStockAlert?: { toNumber(): number } | number | null; reorderPoint?: { toNumber(): number } | number | null; reorderQuantity?: { toNumber(): number } | number | null; conversionFactor?: { toNumber(): number } | number; product?: { name: string } | null; preferredSupplier?: { name: string } | null };
    totalQty: number; totalValue: number;
  } | null;
  initialTab: string;
}

import type { ComponentProps } from 'react';

function toN(v: unknown): number { if(v==null) return 0; if(typeof v==='number') return v; if(typeof v==='object' && 'toNumber' in (v as object)) return (v as {toNumber():number}).toNumber(); return Number(v); }
function fmtIdr(n:number){ return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n); }

export function Product360Tabs({ productVariantId, ledgerData, locations, overview, initialTab }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>((initialTab as Tab) || 'overview');
  const router = useRouter();
  const handleTabChange = useCallback((v: string) => {
    setActiveTab(v as Tab);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', v);
    router.replace(url.pathname + url.search, { scroll: false });
  }, [router]);

  const variant = overview?.variant ?? (ledgerData as unknown as { product?: { skuCode: string; name: string; primaryUnit: string } })?.product;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/warehouse/inventory"><Button variant="outline" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Package className="h-5 w-5" /> {variant ? (('name' in variant) ? (variant as { skuCode: string; name: string }).name : (variant as { skuCode: string; name: string }).name) : productVariantId.slice(0,8)}
          </h1>
          <div className="flex gap-2 mt-1">
            <Badge variant="outline" className="font-mono text-xs">{'skuCode' in (variant as object) ? (variant as { skuCode: string }).skuCode : productVariantId.slice(0,8)}</Badge>
            {overview && <Badge variant="secondary" className="text-[10px]">Stock {formatQuantity(overview.totalQty)} · Value {fmtIdr(overview.totalValue)}</Badge>}
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="flex h-auto gap-1 overflow-x-auto scrollbar-none justify-start">
          <TabsTrigger value="overview" className="text-xs gap-1 shrink-0"><Bookmark className="h-3 w-3" /> Ringkas</TabsTrigger>
          <TabsTrigger value="stock" className="text-xs gap-1 shrink-0"><Warehouse className="h-3 w-3" /> Lokasi</TabsTrigger>
          <TabsTrigger value="ledger" className="text-xs gap-1 shrink-0"><History className="h-3 w-3" /> Ledger</TabsTrigger>
          <TabsTrigger value="batches" className="text-xs gap-1 shrink-0"><Layers className="h-3 w-3" /> Batch</TabsTrigger>
          <TabsTrigger value="bom" className="text-xs gap-1 shrink-0"><Beaker className="h-3 w-3" /> BOM</TabsTrigger>
          <TabsTrigger value="cost" className="text-xs gap-1 shrink-0"><TrendingUp className="h-3 w-3" /> Cost</TabsTrigger>
          <TabsTrigger value="reservations" className="text-xs gap-1 shrink-0"><ListOrdered className="h-3 w-3" /> Reservasi</TabsTrigger>
          <TabsTrigger value="movements" className="text-xs gap-1 shrink-0"><FileClock className="h-3 w-3" /> Movements</TabsTrigger>
        </TabsList>

        <div className="mt-4">
          {activeTab === 'overview' && (
            <Card>
              <CardHeader><CardTitle className="text-base">Overview Produk</CardTitle></CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2 text-sm">
                {overview ? (
                  <>
                    <div><p className="text-xs text-muted-foreground">SKU</p><p className="font-mono font-medium">{overview.variant.skuCode}</p></div>
                    <div><p className="text-xs text-muted-foreground">Nama Varian</p><p className="font-medium">{overview.variant.name}</p></div>
                    <div><p className="text-xs text-muted-foreground">Product</p><p className="font-medium">{overview.variant.product?.name ?? '-'}</p></div>
                    <div><p className="text-xs text-muted-foreground">Unit</p><p className="font-medium">{overview.variant.primaryUnit}</p></div>
                    <div><p className="text-xs text-muted-foreground">Costing</p><p className="font-medium">{overview.variant.costingMethod ?? '-'}</p></div>
                    <div><p className="text-xs text-muted-foreground">Standard Cost</p><p className="font-mono">{overview.variant.standardCost ? fmtIdr(toN(overview.variant.standardCost)) : '-'}</p></div>
                    <div><p className="text-xs text-muted-foreground">Min Stock Alert</p><p className="font-mono">{overview.variant.minStockAlert ? formatQuantity(toN(overview.variant.minStockAlert)) : '-'}</p></div>
                    <div><p className="text-xs text-muted-foreground">Reorder Point</p><p className="font-mono">{overview.variant.reorderPoint ? formatQuantity(toN(overview.variant.reorderPoint)) : '-'}</p></div>
                    <div><p className="text-xs text-muted-foreground">Reorder Qty</p><p className="font-mono">{overview.variant.reorderQuantity ? formatQuantity(toN(overview.variant.reorderQuantity)) : '-'}</p></div>
                    <div><p className="text-xs text-muted-foreground">Preferred Supplier</p><p className="font-medium">{overview.variant.preferredSupplier?.name ?? '-'}</p></div>
                    <div className="md:col-span-2 pt-2 border-t flex gap-4"><div><p className="text-xs text-muted-foreground">Total Qty Semua Lokasi</p><p className="text-xl font-bold">{formatQuantity(overview.totalQty)}</p></div><div><p className="text-xs text-muted-foreground">Total Value</p><p className="text-xl font-bold">{fmtIdr(overview.totalValue)}</p></div></div>
                  </>
                ) : <p className="text-xs text-muted-foreground">Tidak ada overview detail (ledger only mode).</p>}
              </CardContent>
            </Card>
          )}
          {activeTab === 'stock' && <ProductStockByLocationTab productVariantId={productVariantId} />}
          {activeTab === 'ledger' && <StockLedgerClient ledgerData={ledgerData} locations={locations} />}
          {activeTab === 'batches' && <ProductBatchesTab productVariantId={productVariantId} />}
          {activeTab === 'bom' && <ProductBomTab productVariantId={productVariantId} />}
          {activeTab === 'cost' && <ProductCostHistoryTab productVariantId={productVariantId} />}
          {activeTab === 'reservations' && <ProductReservationsTab productVariantId={productVariantId} />}
          {activeTab === 'movements' && <ProductMovementsTab productVariantId={productVariantId} />}
        </div>
      </Tabs>
    </div>
  );
}
