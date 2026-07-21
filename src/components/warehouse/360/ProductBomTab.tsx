'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Beaker } from 'lucide-react';
import { getProduct360Overview } from '@/actions/inventory/product-360';
import Link from 'next/link';

type Overview = { bomAsProduct: { id: string; name: string; outputQuantity: { toNumber(): number } | number; isDefault: boolean }[]; bomAsIngredient: { bom: { id: string; name: string; productVariant: { name: string; skuCode: string } } }[] };

export function ProductBomTab({ productVariantId }: { productVariantId: string }) {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { setLoading(true); const res = await getProduct360Overview(productVariantId); if(res.success && res.data) setData({ bomAsProduct: (res.data as unknown as { bomAsProduct: Overview['bomAsProduct'] }).bomAsProduct ?? [], bomAsIngredient: (res.data as unknown as { bomAsIngredient: Overview['bomAsIngredient'] }).bomAsIngredient ?? [] }); else setData(null); setLoading(false); }, [productVariantId]);
  useEffect(() => { load(); }, [load]);

  if(loading) return <p className="text-xs text-center py-8 text-muted-foreground">Memuat…</p>;
  if(!data) return <p className="text-xs text-center py-8 text-muted-foreground">Gagal memuat BOM.</p>;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Beaker className="h-4 w-4" /> Diproduksi via BOM (sebagai hasil)</CardTitle></CardHeader>
        <CardContent>
          {data.bomAsProduct.length===0 ? <p className="text-xs text-muted-foreground">Tidak ada BOM yang menghasilkan varian ini.</p> :
          <Table><TableHeader className="bg-muted/30"><TableRow><TableHead>BOM Name</TableHead><TableHead>Output Qty</TableHead><TableHead>Default</TableHead></TableRow></TableHeader><TableBody>{data.bomAsProduct.map(b => <TableRow key={b.id}><TableCell className="text-sm"><Link href={`/dashboard/boms/${b.id}`} className="hover:underline text-primary">{b.name}</Link></TableCell><TableCell className="text-sm font-mono">{String(b.outputQuantity)}</TableCell><TableCell>{b.isDefault ? <Badge variant="default" className="text-[10px]">Default</Badge> : '-'}</TableCell></TableRow>)}</TableBody></Table>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Dipakai sebagai Bahan (ingredient)</CardTitle></CardHeader>
        <CardContent>
          {data.bomAsIngredient.length===0 ? <p className="text-xs text-muted-foreground">Tidak dipakai di BOM lain.</p> :
          <Table><TableHeader className="bg-muted/30"><TableRow><TableHead>BOM</TableHead><TableHead>Produk Hasil BOM</TableHead></TableRow></TableHeader><TableBody>{data.bomAsIngredient.map((i, idx) => <TableRow key={`${i.bom.id}-${idx}`}><TableCell className="text-sm"><Link href={`/dashboard/boms/${i.bom.id}`} className="hover:underline text-primary">{i.bom.name}</Link></TableCell><TableCell className="text-sm">{i.bom.productVariant.name} ({i.bom.productVariant.skuCode})</TableCell></TableRow>)}</TableBody></Table>}
        </CardContent>
      </Card>
    </div>
  );
}
