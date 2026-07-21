'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, Clock, CheckCircle, AlertTriangle } from 'lucide-react';
import { getSupplierPerformanceStats } from '@/actions/purchasing/supplier-360';

type Stats = { totalOrders: number; withReceipt: number; avgLeadDays: number | null; onTimeRate: number | null; returnsCount: number };

export function SupplierPerformanceTab({ supplierId }: { supplierId: string }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { setLoading(true); const res = await getSupplierPerformanceStats(supplierId); setStats(res.success ? (res.data as unknown as Stats) : null); setLoading(false); }, [supplierId]);
  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="text-xs text-center py-8 text-muted-foreground">Memuat…</p>;
  if (!stats) return <p className="text-xs text-center py-8 text-muted-foreground">Gagal memuat statistik.</p>;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4" /> Performa Pengiriman (20 PO terakhir)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total PO dinilai</span><span className="font-bold">{stats.totalOrders}</span></div>
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">Dengan penerimaan</span><span className="font-bold">{stats.withReceipt}</span></div>
          <div className="flex justify-between text-sm"><span className="text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> Rata-rata lead time</span><span className="font-bold">{stats.avgLeadDays != null ? `${stats.avgLeadDays} hari` : '-'}</span></div>
          <div className="flex justify-between text-sm"><span className="text-muted-foreground flex items-center gap-1"><CheckCircle className="h-3 w-3" /> On-time rate</span><Badge variant="outline" className={`text-xs ${stats.onTimeRate != null && stats.onTimeRate >= 80 ? 'bg-emerald-500/10 text-emerald-700' : 'bg-amber-500/10 text-amber-700'}`}>{stats.onTimeRate != null ? `${stats.onTimeRate}%` : '-'}</Badge></div>
          <div className="flex justify-between text-sm"><span className="text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Retur tercatat</span><span className="font-bold">{stats.returnsCount}</span></div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Interpretasi</CardTitle></CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-2">
          <p>• Lead time = selisih orderDate → first goods receipt. Semakin kecil semakin bagus.</p>
          <p>• On-time = penerimaan ≤ expectedDate. Butuh expectedDate diisi untuk akurasi.</p>
          <p>• Retur = jumlah purchase returns untuk supplier ini (kualitas/mismatch).</p>
          <p>• Statistik hanya dari 20 PO terakhir dengan status RECEIVED/COMPLETED.</p>
        </CardContent>
      </Card>
    </div>
  );
}
