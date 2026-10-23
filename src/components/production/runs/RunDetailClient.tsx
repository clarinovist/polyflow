'use client';

import { PageHeader } from '@/components/ui/page-header';
import { getStatusLabel } from '@/lib/labels/helpers';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { cancelProductionRun, getRunCost, getRunReadiness, checkRunRmAvailability } from '@/actions/production/production-runs';
import { toast } from 'sonner';
import { useEffect, useState } from 'react';
import { RouteFlowChain, type RouteFlowChainStep } from '@/components/production/routing/RouteFlowChain';
import { formatQuantity } from '@/lib/utils/utils';

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

  const [readState, setReadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [retryRead, setRetryRead] = useState(0);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const hasOutput = run.orders.some((order) => Number(order.actualQuantity ?? 0) > 0);

  useEffect(() => {
    let cancelled = false;
    setReadState('loading');
    Promise.all([getRunReadiness(run.id), getRunCost(run.id), checkRunRmAvailability(run.id)])
      .then(([readyRes, costRes, rmRes]) => {
        if (cancelled) return;
        if (!readyRes.success || !readyRes.data || !costRes.success || !costRes.data || !rmRes.success || !rmRes.data) {
          setReadState('error');
          return;
        }
        setReadiness(readyRes.data as unknown as ReadinessRow[]);
        setCost(costRes.data as never);
        setRmCheck(rmRes.data as never);
        setReadState('ready');
      }).catch(() => { if (!cancelled) setReadState('error'); });
    return () => { cancelled = true; };
  }, [run.id, retryRead]);

  async function handleCancel() {
    if (cancelling || (hasOutput && !reason.trim())) return;
    setCancelling(true);
    try {
      const res = await cancelProductionRun(hasOutput ? { id: run.id, force: true, reason: reason.trim() } : run.id);
      if (res.success) { toast.success('Rangkaian dibatalkan'); window.location.reload(); }
      else toast.error(res.error || 'Gagal membatalkan rangkaian');
    } catch {
      toast.error('Gagal membatalkan rangkaian. Coba lagi.');
    } finally {
      setCancelling(false);
    }
  }

  const total = run.orders.length;
  const completed = run.orders.filter((o) => o.status === 'COMPLETED').length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  const readinessMap = new Map((readState === 'ready' ? readiness : []).map((r) => [r.orderId, r]));

  return (
    <div className="space-y-6">
      <PageHeader title={run.runNumber} description="Detail Rangkaian Produksi" />
      {readState === 'loading' && <p role="status">Memuat kesiapan bahan dan biaya…</p>}
      {readState === 'error' && <div role="alert" className="rounded-xl border p-4">Kesiapan bahan dan biaya belum dapat dimuat; bukan berarti stok atau biaya nol. <Button variant="outline" onClick={() => setRetryRead((value) => value + 1)}>Coba lagi</Button></div>}
      <AlertDialog open={cancelOpen} onOpenChange={(open) => { if (!cancelling) setCancelOpen(open); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Batalkan rangkaian?</AlertDialogTitle><AlertDialogDescription>{hasOutput ? 'Rangkaian sudah memiliki hasil produksi. Pembatalan paksa memerlukan alasan dan tetap mengikuti validasi server.' : 'SPK yang belum selesai pada rangkaian ini akan dibatalkan.'}</AlertDialogDescription></AlertDialogHeader>
          {hasOutput && <div className="space-y-2"><Label htmlFor="run-cancel-reason">Alasan pembatalan (wajib)</Label><Input id="run-cancel-reason" disabled={cancelling} value={reason} onChange={(event) => setReason(event.target.value)} /></div>}
          <AlertDialogFooter><AlertDialogCancel disabled={cancelling}>Kembali</AlertDialogCancel><Button variant="destructive" disabled={cancelling || (hasOutput && !reason.trim())} onClick={handleCancel}>{cancelling ? 'Membatalkan…' : 'Konfirmasi Pembatalan'}</Button></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-lg">{run.runNumber} · {run.routeNameSnapshot ?? run.route?.name} v{run.routeVersionSnapshot}</CardTitle>
          <div className="flex gap-2 items-center flex-wrap">
            <Badge>{getStatusLabel(run.status)}</Badge>
            <Badge variant="outline">{percent}% · {completed}/{total} selesai</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>Produk: {run.productVariant?.product?.name} {run.productVariant?.name} ({run.productVariant?.skuCode}) · Target {formatQuantity(Number(run.plannedQuantity))}</div>

          {readState === 'ready' && rmCheck && (
            <div className={`p-2.5 rounded text-xs border ${rmCheck.ready ? 'bg-primary/10 border-primary/20 text-foreground' : 'bg-muted border-border text-foreground'}`}>
              {rmCheck.ready ? '✓ Bahan baku tersedia untuk tahap pertama' : `⚠ Kekurangan bahan baku: ${rmCheck.shortages.length} item kurang — belanja/catat stok dulu`}
              {!rmCheck.ready && rmCheck.shortages.slice(0, 5).map((s, i) => (
                <div key={i} className="mt-1 flex flex-wrap gap-1.5 items-center">
                  <Badge variant="outline" className="text-[10px] font-mono h-4">{s.skuCode || '?'}</Badge>
                  <span>{s.name || 'Bahan baku'}</span>
                  <span className="text-[11px]">butuh {formatQuantity(s.needed)} · ada {formatQuantity(s.available)} · kurang {formatQuantity(s.shortage)}</span>
                </div>
              ))}
              {!rmCheck.ready && rmCheck.shortages.length > 5 && <div className="mt-1 text-[11px]">+{rmCheck.shortages.length - 5} lagi...</div>}
            </div>
          )}

          {readState === 'ready' && cost && (
            <div className="p-2 rounded bg-muted text-xs">
              <div className="font-semibold">Biaya (WIP internal tidak dihitung ganda)</div>
              <div>Bahan baku eksternal: {cost.externalMaterialCost.toFixed(2)} · WIP internal (informasi): {cost.internalWipValue.toFixed(2)} · Konversi: {cost.conversionCost.toFixed(2)} · Penyesuaian scrap: {cost.scrapCost.toFixed(2)}</div>
              <div>Total HPP tanpa hitung ganda: {cost.totalHppNoDoubleCount.toFixed(2)} · Output {formatQuantity(cost.totalOutputQty)} · HPP/unit {cost.hppPerUnit.toFixed(2)}</div>
              <div>Rekonsiliasi output movement: {cost.outputMovementValuation.toFixed(2)} · delta {cost.reconciliationDelta.toFixed(2)}</div>
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            {run.status !== 'COMPLETED' && run.status !== 'CANCELLED' && <Button size="sm" variant="destructive" onClick={() => setCancelOpen(true)}>Batalkan Rangkaian</Button>}
            {run.route?.id && <Button size="sm" variant="outline" asChild><Link href={`/production/routings/${run.route.id}`}>Lihat Routing</Link></Button>}
          </div>
        </CardContent>
      </Card>

      {run.route?.steps && run.route.steps.length > 0 && (
        <RouteFlowChain
          title="Tahapan Routing & Kesiapan"
          steps={(run.route.steps.map((s, idx) => {
            const order = run.orders.find((o) => o.routeSequenceSnapshot === idx || o.processCodeSnapshot === s.stepCode);
            const r = order ? readinessMap.get(order.id) : undefined;
            const readinessLabel = r ? (r.canStart ? (r.status === 'FIRST_STEP' ? 'FIRST' : r.status === 'READY' ? 'SIAP' : 'PARTIAL') : r.status) : '—';
            return {
              label: s.label,
              stepCode: s.stepCode,
              processCode: s.process?.code ?? '',
              outputSkuLabel: order ? `${order.orderNumber} · ${formatQuantity(Number(order.plannedQuantity))}→${order.actualQuantity ? formatQuantity(Number(order.actualQuantity)) : '-'}` : s.stepCode,
              outputLocationName: order?.location?.name ?? undefined,
              status: (order?.status ?? r?.status ?? undefined) as RouteFlowChainStep['status'],
              readinessLabel: order ? `${readinessLabel} avail ${r ? formatQuantity(r.available) : '-'}${r?.reason ? ` · ${r.reason}` : ''}${order.machine ? ` · Mesin ${order.machine.name}` : ''}` : undefined,
              extraLine: undefined,
            } as RouteFlowChainStep;
          }) as RouteFlowChainStep[])}
        />
      )}

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
                    <Badge variant="outline">{getStatusLabel(o.status, 'production')}</Badge>
                    {o.processNameSnapshot && <span className="text-xs text-muted-foreground">Tahap {o.routeSequenceSnapshot != null ? (o.routeSequenceSnapshot + 1) : '?'} · {o.processNameSnapshot}</span>}
                    {r && <Badge variant={r.canStart ? 'default' : 'secondary'} className="text-[10px]">{r.status}</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {o.sourceLocation?.name ?? '?'} → {o.location?.name ?? '?'} · Rencana {formatQuantity(Number(o.plannedQuantity))} · Aktual {o.actualQuantity ? formatQuantity(Number(o.actualQuantity)) : '-'} {r ? `· WIP tersedia ${formatQuantity(r.available)}` : ''}
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
