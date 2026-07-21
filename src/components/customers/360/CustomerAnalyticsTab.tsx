'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3 } from 'lucide-react';
import { getCustomerSalesAnalytics } from '@/actions/sales/customer-360';

type Entry = { month: string; total: number; count: number };

function fmtIdr(n: number){ return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n); }

export function CustomerAnalyticsTab({ customerId }: { customerId: string }) {
  const [data, setData] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { setLoading(true); const res = await getCustomerSalesAnalytics(customerId); setData(res.success ? (res.data as unknown as Entry[] ?? []) : []); setLoading(false); }, [customerId]);
  useEffect(() => { load(); }, [load]);

  const max = Math.max(1, ...data.map(d => d.total));

  return (
    <Card>
      <CardHeader className="pb-3"><div className="flex items-center gap-3"><BarChart3 className="h-5 w-5 text-primary" /><div><CardTitle className="text-base">Analitik Penjualan 6 Bulan</CardTitle><p className="text-xs text-muted-foreground">Volume SO per bulan</p></div></div></CardHeader>
      <CardContent>
        {loading ? <p className="text-xs text-center py-8 text-muted-foreground">Memuat…</p> : data.length===0 ? <p className="text-xs text-center py-8 text-muted-foreground">Belum ada data.</p> :
        <div className="space-y-3">
          {data.map(entry => (
            <div key={entry.month} className="space-y-1">
              <div className="flex justify-between text-xs"><span className="font-medium">{entry.month}</span><span className="text-muted-foreground">{entry.count} order · {fmtIdr(entry.total)}</span></div>
              <div className="h-2 rounded bg-muted overflow-hidden"><div className="h-full bg-primary rounded" style={{ width: `${Math.round((entry.total / max) * 100)}%` }} /></div>
            </div>
          ))}
        </div>}
      </CardContent>
    </Card>
  );
}
