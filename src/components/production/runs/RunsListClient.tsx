'use client';

import { useEffect, useRef, useState } from 'react';
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

type RouteOption = { id: string; name: string; code: string; productVariant?: { skuCode: string; name: string; product?: { name: string } } };

export function RunsListClient({ initialRuns }: { initialRuns: RunType[] }) {
  const [runs] = useState(initialRuns);
  const [showCreate, setShowCreate] = useState(false);
  const [formRouteId, setFormRouteId] = useState('');
  const [formQty, setFormQty] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [routeSearch, setRouteSearch] = useState('');
  const [routeOptions, setRouteOptions] = useState<RouteOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  // I3: stable per-session idempotency key — generated once, reused for retries, rotated after success
  const idempotencyKeyRef = useRef(`run-${crypto.randomUUID()}`);

  useEffect(() => {
    if (!showCreate) return;
    fetch('/api/production/routes?q=' + encodeURIComponent(routeSearch))
      .then((r) => r.json())
      .then((j) => {
        if (Array.isArray(j)) setRouteOptions(j.slice(0, 30));
      })
      .catch(() => {});
  }, [showCreate, routeSearch]);

  const filtered = runs.filter((r) => {
    if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
    if (search && !`${r.runNumber} ${r.route?.name} ${r.productVariant?.skuCode}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  async function handleCreate() {
    const qty = Number(formQty);
    if (!formRouteId || !qty) {
      toast.error('RouteId dan qty wajib');
      return;
    }
    setSubmitting(true);
    try {
      // I3: use stable per-session key for idempotency (retries reuse same key)
      const res = await createProductionRun({ routeId: formRouteId, plannedQuantity: qty, priority: 'NORMAL', idempotencyKey: idempotencyKeyRef.current });
      if (res.success) {
        // Rotate key after success so next submission gets a fresh key
        idempotencyKeyRef.current = `run-${crypto.randomUUID()}`;
        toast.success('Run dibuat');
        window.location.reload();
      } else toast.error(res.error || 'Gagal buat run');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-end">
        <Input placeholder="Cari run/route/sku" value={search} onChange={(e) => setSearch(e.target.value)} className="w-52" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Semua</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="RELEASED">Released</SelectItem>
            <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
            <SelectItem value="COMPLETED">Completed</SelectItem>
            <SelectItem value="CANCELLED">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => setShowCreate(!showCreate)}>{showCreate ? 'Tutup' : 'Buat Run'}</Button>
      </div>

      {showCreate && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div>
              <Label>Routing (ACTIVE)</Label>
              <Input value={routeSearch} onChange={(e) => setRouteSearch(e.target.value)} placeholder="Cari route name/code/sku" className="text-xs mb-1" />
              <div className="border rounded max-h-40 overflow-auto divide-y">
                {routeOptions.map((ro) => (
                  <button key={ro.id} type="button" onClick={() => { setFormRouteId(ro.id); setRouteSearch(`${ro.name} v? ${ro.productVariant?.skuCode ?? ''}`); }} className={`w-full text-left px-2 py-1.5 text-xs hover:bg-muted ${formRouteId === ro.id ? 'bg-muted font-semibold' : ''}`}>
                    <span className="font-mono">{ro.code}</span> {ro.name} — {ro.productVariant?.product?.name} {ro.productVariant?.name} ({ro.productVariant?.skuCode})
                  </button>
                ))}
              </div>
              <Input value={formRouteId} onChange={(e) => setFormRouteId(e.target.value)} placeholder="Atau paste route UUID ACTIVE" className="text-[10px] font-mono mt-1" />
            </div>
            <div><Label>Planned Qty (FG target)</Label><Input type="number" value={formQty} onChange={(e) => setFormQty(e.target.value)} placeholder="10000" /></div>
            <Button onClick={handleCreate} disabled={submitting}>{submitting ? 'Membuat...' : 'Buat Production Run'}</Button>
            <p className="text-xs text-muted-foreground">Run akan membuat N SPK sesuai route steps dengan qty scaling mundur dari BOM + scrap. Idempotency key mencegah duplicate double-click.</p>
          </CardContent>
        </Card>
      )}

      {filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Belum ada production runs. Buat dari routing aktif atau dari Papan Permintaan FG.</CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((r) => {
            const total = r.orders?.length ?? 0;
            const completed = r.orders?.filter((o) => o.status === 'COMPLETED').length ?? 0;
            return (
              <Card key={r.id}>
                <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex gap-2 items-center flex-wrap">
                      <Link href={`/production/runs/${r.id}`} className="font-semibold hover:underline">{r.runNumber}</Link>
                      <Badge>{r.status}</Badge>
                      <span className="text-xs text-muted-foreground">{r.route?.name} v{r.route?.version} · {String(r.plannedQuantity)}</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {r.productVariant?.product?.name} {r.productVariant?.name} ({r.productVariant?.skuCode}) · Progress {completed}/{total}
                    </div>
                  </div>
                  <Button size="sm" asChild variant="secondary"><Link href={`/production/runs/${r.id}`}>Detail</Link></Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
