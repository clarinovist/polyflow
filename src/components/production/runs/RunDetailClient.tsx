'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { cancelProductionRun, getRunCost, getRunReadiness, checkRunRmAvailability } from '@/actions/production/production-runs';
import { toast } from 'sonner';
import { useEffect, useState } from 'react';

type RunDetail = {
  id: string;
  runNumber: string;
  status: string;
  plannedQuantity: unknown;
  routeVersionSnapshot: number;
  routeNameSnapshot: string | null;
  productVariant?: { skuCode: string; name: string; product?: { name: string } };
  route?: { id: string; code: string; name: string; version: number; steps?: { stepCode: string; label: string; process?: { code: string } }[] };
  orders: Array<{
    id: string;
    orderNumber: string;
    status: string;
    plannedQuantity: unknown;
    actualQuantity: unknown | null;
    routeSequenceSnapshot: number | null;
    processCodeSnapshot: string | null;
    processNameSnapshot: string | null;
    machine?: { name: string; code: string } | null;
    location?: { name: string; slug: string } | null;
    sourceLocation?: { name: string; slug: string } | null;
  }>;
};

type ReadinessRow = { orderId: string; status: string; canStart: boolean; reason?: string; available: number };

export function RunDetailClient({ initialRun }: { initialRun: RunDetail }) {
  const [run] = useState(initialRun);
  const [readiness, setReadiness] = useState<ReadinessRow[]>([]);
  const [cost, setCost] = useState<{ externalMaterialCost: number; internalWipValue: number; conversionCost: number; scrapCost: number; outputMovementValuation: number; reconciliationDelta: number; totalHppNoDoubleCount: number; hppPerUnit: number; totalOutputQty: number } | null>(null);
  const [rmCheck, setRmCheck] = useState<{ ready: boolean; shortages: { productVariantId: string; skuCode: string; name: string; needed: number; available: number; shortage: number }[] } | null>(null);

  useEffect(() => {
    getRunReadiness(run.id).then((res) => {
      if (res.success && res.data) setReadiness(res.data as unknown as ReadinessRow[]);
    });
    getRunCost(run.id).then((res) => {
      if (res.success && res.data) setCost(res.data as never);
    });
    checkRunRmAvailability(run.id).then((res) => {
      if (res.success && res.data) setRmCheck(res.data as never);
    });
  }, [run.id]);

  async function handleCancel() {
    const hasOutput = run.orders.some((o) => o.actualQuantity && Number(o.actualQuantity) > 0);
    if (hasOutput) {
      const reason = prompt('Run sudah punya output. Masukkan alasan cancel (wajib) dan akan force-cancel:');
      if (!reason) return;
      if (!confirm(`Force cancel run dengan ${run.orders.filter((o) => o.actualQuantity && Number(o.actualQuantity) > 0).length} SPK ber-output?`)) return;
      const res = await cancelProductionRun({ id: run.id, force: true, reason });
      if (res.success) { toast.success('Run force-cancelled'); window.location.reload(); } else toast.error(res.error || 'Gagal cancel');
      return;
    }
    if (!confirm('Cancel run ini? Semua SPK yang belum selesai akan di-cancel.')) return;
    const res = await cancelProductionRun(run.id);
    if (res.success) {
      toast.success('Run cancelled');
      window.location.reload();
    } else toast.error(res.error || 'Gagal cancel');
  }

  const total = run.orders.length;
  const completed = run.orders.filter((o) => o.status === 'COMPLETED').length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  const readinessMap = new Map(readiness.map((r) => [r.orderId, r]));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/production/runs" className="text-muted-foreground hover:underline">Runs</Link>
        <span>/</span><span className="font-semibold">{run.runNumber}</span>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-lg">{run.runNumber} · {run.routeNameSnapshot ?? run.route?.name} v{run.routeVersionSnapshot}</CardTitle>
          <div className="flex gap-2 items-center flex-wrap">
            <Badge>{run.status}</Badge>
            <Badge variant="outline">{percent}% · {completed}/{total} selesai</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>Produk: {run.productVariant?.product?.name} {run.productVariant?.name} ({run.productVariant?.skuCode}) · Target {String(run.plannedQuantity)}</div>

          {rmCheck && (
            <div className={`p-2 rounded text-xs border ${rmCheck.ready ? 'bg-green-50 border-green-200 text-green-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
              {rmCheck.ready ? '✓ RM tersedia untuk tahap pertama' : `⚠ RM shortage: ${rmCheck.shortages.length} item kurang`}
              {!rmCheck.ready && rmCheck.shortages.slice(0, 3).map((s, i) => (
                <div key={i} className="font-mono">{s.skuCode || s.productVariantId.slice(0, 8)} — {s.name || '?'} need {s.needed} have {s.available} short {s.shortage}</div>
              ))}
            </div>
          )}

          {cost && (
            <div className="p-2 rounded bg-muted text-xs">
              <div className="font-semibold">Costing (no double count internal WIP)</div>
              <div>External RM: {cost.externalMaterialCost.toFixed(2)} · Internal WIP (info): {cost.internalWipValue.toFixed(2)} · Conversion: {cost.conversionCost.toFixed(2)} · Scrap adjustment: {cost.scrapCost.toFixed(2)}</div>
              <div>Total HPP no double: {cost.totalHppNoDoubleCount.toFixed(2)} · Output {cost.totalOutputQty} · HPP/unit {cost.hppPerUnit.toFixed(2)}</div>
              <div>Rekonsiliasi output movement: {cost.outputMovementValuation.toFixed(2)} · delta {cost.reconciliationDelta.toFixed(2)}</div>
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            {run.status !== 'COMPLETED' && run.status !== 'CANCELLED' && <Button size="sm" variant="destructive" onClick={handleCancel}>Cancel Run</Button>}
            {run.route?.id && <Button size="sm" variant="outline" asChild><Link href={`/production/routings/${run.route.id}`}>Lihat Routing</Link></Button>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Timeline Route + Readiness</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {run.route?.steps?.map((s, idx) => {
              const order = run.orders.find((o) => o.routeSequenceSnapshot === idx || o.processCodeSnapshot === s.stepCode);
              const r = order ? readinessMap.get(order.id) : undefined;
              const statusColor = order?.status === 'COMPLETED' ? 'bg-green-100 text-green-800 border-green-200' : order?.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-800 border-blue-200' : order?.status === 'CANCELLED' ? 'bg-red-50 text-red-600 border-red-200' : 'bg-gray-50 text-gray-600 border-gray-200';
              const readinessLabel = r ? (r.canStart ? (r.status === 'FIRST_STEP' ? 'FIRST' : r.status === 'READY' ? 'SIAP' : 'PARTIAL') : r.status) : '—';
              return (
                <div key={idx} className={`p-3 rounded border min-w-[200px] ${statusColor}`}>
                  <div className="font-semibold text-sm">{idx + 1}. {s.label}</div>
                  <div className="text-xs">{s.stepCode} · {s.process?.code ?? ''}</div>
                  {order && (
                    <div className="text-xs mt-1 space-y-0.5">
                      <div>{order.orderNumber} · {order.status}</div>
                      <div>{String(order.plannedQuantity)} → {order.actualQuantity ? String(order.actualQuantity) : '-'}</div>
                      <div>Readiness: <Badge variant="outline" className="text-[10px]">{readinessLabel}</Badge> avail {r?.available ?? '-'}</div>
                      {r?.reason && <div className="text-[10px] text-amber-700">{r.reason}</div>}
                      {order.machine && <div>Mesin: {order.machine.name}</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">SPK Tahapan</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {[...run.orders].sort((a, b) => (a.routeSequenceSnapshot ?? 0) - (b.routeSequenceSnapshot ?? 0)).map((o) => {
            const r = readinessMap.get(o.id);
            return (
              <div key={o.id} className="flex flex-col md:flex-row md:items-center justify-between p-3 border rounded gap-2">
                <div className="space-y-0.5 flex-1">
                  <div className="flex gap-2 items-center flex-wrap">
                    <Link href={`/production/orders/${o.id}`} className="font-mono font-semibold hover:underline">{o.orderNumber}</Link>
                    <Badge variant="outline">{o.status}</Badge>
                    {o.processNameSnapshot && <span className="text-xs text-muted-foreground">Tahap {o.routeSequenceSnapshot != null ? (o.routeSequenceSnapshot + 1) : '?'} · {o.processNameSnapshot}</span>}
                    {r && <Badge variant={r.canStart ? 'default' : 'secondary'} className="text-[10px]">{r.status}</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {o.sourceLocation?.name ?? '?'} → {o.location?.name ?? '?'} · Plan {String(o.plannedQuantity)} · Aktual {o.actualQuantity ? String(o.actualQuantity) : '-'} {r ? `· WIP avail ${r.available}` : ''}
                  </div>
                  {r?.reason && !r.canStart && <div className="text-xs text-amber-600">{r.reason}</div>}
                </div>
                <div className="flex gap-1">
                  <Button size="sm" asChild variant="secondary"><Link href={`/production/orders/${o.id}`}>Buka SPK</Link></Button>
                  <Button size="sm" asChild variant="outline"><Link href={`/kiosk?orderId=${o.id}`}>Kiosk</Link></Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
