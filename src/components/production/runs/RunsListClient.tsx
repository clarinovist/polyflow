'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Link from 'next/link';
import { createProductionRun } from '@/actions/production/production-runs';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type RunType = {
  id: string;
  runNumber: string;
  status: string;
  plannedQuantity: unknown;
  productVariant?: { skuCode: string; name: string; product?: { name: string } };
  route?: { code: string; name: string; version: number };
  orders?: { orderNumber: string; status: string }[];
};

type RouteOption = {
  id: string;
  name: string;
  code: string;
  version: number;
  isDefault: boolean;
  _count?: { steps: number };
  productVariant?: { skuCode: string; name: string; primaryUnit?: string; product?: { name: string; productType?: string } };
};

export function RunsListClient({ initialRuns }: { initialRuns: RunType[] }) {
  const [runs] = useState(initialRuns);
  const [showCreate, setShowCreate] = useState(false);
  const [formRouteId, setFormRouteId] = useState('');
  const [selectedRoute, setSelectedRoute] = useState<RouteOption | null>(null);
  const [formQty, setFormQty] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [routeSearch, setRouteSearch] = useState('');
  const [routeOptions, setRouteOptions] = useState<RouteOption[]>([]);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const idempotencyKeyRef = useRef(`run-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    if (!showCreate) return;
    setLoadingRoutes(true);
    fetch('/api/production/routes?q=' + encodeURIComponent(routeSearch))
      .then((r) => r.json())
      .then((j) => {
        if (Array.isArray(j)) setRouteOptions(j.slice(0, 50));
      })
      .catch(() => {})
      .finally(() => setLoadingRoutes(false));
  }, [showCreate, routeSearch]);

  const filtered = useMemo(() => {
    return runs.filter((r) => {
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
      if (
        search &&
        !`${r.runNumber} ${r.route?.name} ${r.productVariant?.skuCode} ${r.productVariant?.name} ${r.productVariant?.product?.name}`
          .toLowerCase()
          .includes(search.toLowerCase())
      )
        return false;
      return true;
    });
  }, [runs, statusFilter, search]);

  async function handleCreate() {
    const qty = Number(formQty);
    if (!formRouteId || !qty || qty <= 0) {
      toast.error('Pilih routing aktif dan isi qty yang valid');
      return;
    }
    setSubmitting(true);
    try {
      const res = await createProductionRun({ routeId: formRouteId, plannedQuantity: qty, priority: 'NORMAL', idempotencyKey: idempotencyKeyRef.current });
      if (res.success) {
        idempotencyKeyRef.current = `run-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;
        toast.success('Production run dibuat — SPK tahapan tergenerate');
        window.location.reload();
      } else toast.error(res.error || 'Gagal buat run');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-end justify-between">
        <div className="flex gap-2 items-center flex-wrap">
          <Input placeholder="Cari run / routing / sku / produk" value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Semua status</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="RELEASED">Released</SelectItem>
              <SelectItem value="IN_PROGRESS">Jalan</SelectItem>
              <SelectItem value="COMPLETED">Selesai</SelectItem>
              <SelectItem value="CANCELLED">Batal</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => setShowCreate(!showCreate)} size="sm">{showCreate ? 'Tutup' : 'Buat Run Baru'}</Button>
      </div>

      {showCreate && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="space-y-2">
              <Label>Routing — pilih yang sudah Published & Default</Label>
              <p className="text-[11px] text-muted-foreground">
                Run butuh routing yang sudah <strong>Published</strong>. Idealnya pilih routing yang <Badge variant="outline" className="text-[10px] h-4">Default</Badge> karena itu versi terbaru. Satu run akan membuat N SPK berantai sesuai tahap routing.
              </p>

              {selectedRoute && (
                <div className="rounded border bg-muted/50 p-3 text-sm flex justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate">{selectedRoute.name} <span className="text-muted-foreground font-normal">v{selectedRoute.version}</span></div>
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-1.5 items-center mt-1">
                      <Badge variant="outline" className="text-[10px] font-mono h-4">{selectedRoute.productVariant?.skuCode ?? '-'}</Badge>
                      <span className="truncate">{selectedRoute.productVariant?.product?.name} {selectedRoute.productVariant?.name}</span>
                      {selectedRoute.isDefault && <Badge className="text-[10px] h-4">Default</Badge>}
                      {selectedRoute._count && <span>{selectedRoute._count.steps} tahap</span>}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 text-xs shrink-0" onClick={() => { setSelectedRoute(null); setFormRouteId(''); }}>Ganti</Button>
                </div>
              )}

              <Input value={routeSearch} onChange={(e) => setRouteSearch(e.target.value)} placeholder="Cari routing / produk / sku..." className="text-sm h-9" />
              {loadingRoutes && <div className="text-xs text-muted-foreground">Memuat routing aktif...</div>}

              {!selectedRoute && (
                <div className="border rounded max-h-64 overflow-auto divide-y">
                  {routeOptions.map((ro) => (
                    <button key={ro.id} type="button" onClick={() => { setFormRouteId(ro.id); setSelectedRoute(ro); }} className={`w-full text-left px-3 py-2.5 text-sm hover:bg-muted flex justify-between gap-2 ${formRouteId === ro.id ? 'bg-muted' : ''}`}>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate flex items-center gap-1.5">
                          {ro.name} <span className="text-muted-foreground font-normal">v{ro.version}</span>
                          {ro.isDefault && <Badge className="text-[10px] h-4">Default</Badge>}
                        </div>
                        <div className="text-[11px] text-muted-foreground flex flex-wrap gap-1.5 items-center mt-0.5">
                          <span className="font-mono">{ro.productVariant?.skuCode}</span>
                          <span className="truncate">{ro.productVariant?.product?.name} {ro.productVariant?.name}</span>
                          {ro._count && <span>· {ro._count.steps} tahap</span>}
                        </div>
                      </div>
                    </button>
                  ))}
                  {!loadingRoutes && routeOptions.length === 0 && (
                    <div className="text-xs text-muted-foreground p-4 text-center">
                      Tidak ada routing Published. Buat & publish routing dulu di <Link href="/production/routings" className="underline">/production/routings</Link>.
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Target Kuantitas Produk Akhir ({selectedRoute?.productVariant?.primaryUnit ?? 'satuan sesuai variant'})</Label>
              <Input type="number" value={formQty} onChange={(e) => setFormQty(e.target.value)} placeholder="Contoh: 1000" className="h-9" />
              <p className="text-[11px] text-muted-foreground">
                Kuantitas akan di-scaling mundur lewat BoM tiap tahap (termasuk scrap). Contoh: jika target FG 1000 dan BOM tahap 1 output 500, maka tahap 1 butuh 2x.
              </p>
            </div>

            <Button onClick={handleCreate} disabled={submitting || !formRouteId || !formQty}>
              {submitting ? 'Membuat...' : 'Buat Production Run'}
            </Button>
          </CardContent>
        </Card>
      )}

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center text-lg">🏭</div>
            <div className="space-y-1">
              <div className="font-semibold">Belum ada production run</div>
              <div className="text-sm text-muted-foreground max-w-lg mx-auto">
                Run adalah eksekusi berantai dari routing — satu run menggenerate N SPK (satu SPK per tahap). Butuh routing yang sudah <strong>Published</strong> dan idealnya <strong>Default</strong>. Tanpa routing pun tetap bisa SPK manual via BoM.
              </div>
            </div>
            {!showCreate && (
              <div className="flex gap-2 justify-center pt-2 flex-wrap">
                <Button size="sm" onClick={() => setShowCreate(true)}>Buat Run Baru</Button>
                <Button size="sm" variant="outline" asChild><Link href="/production/routings">Lihat Routing</Link></Button>
                <Button size="sm" variant="outline" asChild><Link href="/production/demand-board">Papan Permintaan</Link></Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((r) => {
            const total = r.orders?.length ?? 0;
            const completed = r.orders?.filter((o) => o.status === 'COMPLETED').length ?? 0;
            const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
            return (
              <Card key={r.id}>
                <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex gap-2 items-center flex-wrap">
                      <Link href={`/production/runs/${r.id}`} className="font-semibold hover:underline">{r.runNumber}</Link>
                      <Badge variant={r.status === 'COMPLETED' ? 'default' : r.status === 'IN_PROGRESS' ? 'secondary' : 'outline'}>{r.status}</Badge>
                      <span className="text-xs text-muted-foreground">{r.route?.name} v{r.route?.version} · target {String(r.plannedQuantity)}</span>
                    </div>
                    <div className="text-sm flex items-center gap-1.5 flex-wrap min-w-0">
                      {r.productVariant?.skuCode && <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted">{r.productVariant.skuCode}</span>}
                      <span className="truncate">{r.productVariant?.product?.name} {r.productVariant?.name}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Progress {completed}/{total} · {progress}%
                    </div>
                  </div>
                  <Button size="sm" asChild variant="secondary" className="shrink-0"><Link href={`/production/runs/${r.id}`}>Detail →</Link></Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
