'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Link from 'next/link';
import {
  addRouteStep,
  deleteRouteStep,
  reorderRouteSteps,
  validateRouteAction,
  publishRoute,
  archiveRoute,
} from '@/actions/production/production-routings';
import { toast } from 'sonner';

type RouteType = {
  id: string;
  code: string;
  name: string;
  version: number;
  status: string;
  isDefault: boolean;
  productVariantId: string;
  productVariant?: { skuCode: string; name: string; product?: { name: string } };
  steps: Array<{
    id: string;
    sequence: number;
    stepCode: string;
    label: string;
    processId: string;
    process: { id: string; code: string; name: string; requiresMachine: boolean };
    bomId: string;
    bom: { id: string; name: string; productVariantId: string };
    materialSourceLocationId: string | null;
    outputLocationId: string | null;
    materialSourceLocation?: { id: string; name: string; slug: string } | null;
    outputLocation?: { id: string; name: string; slug: string } | null;
    requiresQualityGate: boolean;
    allowsPartialHandoff: boolean;
  }>;
};

type NewStepForm = {
  stepCode: string;
  label: string;
  processId: string;
  bomId: string;
  materialSourceLocationId: string;
  outputLocationId: string;
  allowsPartialHandoff: boolean;
  requiresQualityGate: boolean;
};

type Option = { id: string; name: string; code?: string; skuCode?: string; slug?: string };

export function RouteBuilderClient({ initialRoute }: { initialRoute: RouteType }) {
  const [route] = useState(initialRoute);
  const [form, setForm] = useState<NewStepForm>({
    stepCode: '',
    label: '',
    processId: '',
    bomId: '',
    materialSourceLocationId: '',
    outputLocationId: '',
    allowsPartialHandoff: false,
    requiresQualityGate: false,
  });
  const [validationIssues, setValidationIssues] = useState<Array<{ code: string; severity: string; message: string; stepCode?: string; field?: string }>>([]);
  const [processes, setProcesses] = useState<Option[]>([]);
  const [boms, setBoms] = useState<Option[]>([]);
  const [locs, setLocs] = useState<Option[]>([]);
  const [procSearch, setProcSearch] = useState('');
  const [bomSearch, setBomSearch] = useState('');
  const [locSearch, setLocSearch] = useState('');

  useEffect(() => {
    fetch('/api/production/processes?q=' + encodeURIComponent(procSearch))
      .then((r) => r.json())
      .then((j) => {
        if (Array.isArray(j)) setProcesses(j.slice(0, 30).map((p: { id: string; name: string; code: string }) => ({ id: p.id, name: p.name, code: p.code })));
      })
      .catch(() => {});
  }, [procSearch]);

  useEffect(() => {
    fetch('/api/boms?q=' + encodeURIComponent(bomSearch))
      .then((r) => r.json())
      .then((j) => {
        if (Array.isArray(j)) setBoms(j.slice(0, 30).map((b: { id: string; name: string; productVariant?: { skuCode?: string } }) => ({ id: b.id, name: b.name, skuCode: b.productVariant?.skuCode ?? '' })));
        else if (j && Array.isArray(j.data)) setBoms(j.data.slice(0, 30).map((b: { id: string; name: string }) => ({ id: b.id, name: b.name })));
      })
      .catch(() => {});
  }, [bomSearch]);

  useEffect(() => {
    fetch('/api/locations?q=' + encodeURIComponent(locSearch))
      .then((r) => r.json())
      .then((j) => {
        if (Array.isArray(j)) setLocs(j.slice(0, 30).map((l: { id: string; name: string; slug: string }) => ({ id: l.id, name: l.name, slug: l.slug })));
        else if (j && Array.isArray(j.data)) setLocs(j.data.slice(0, 30).map((l: { id: string; name: string; slug: string }) => ({ id: l.id, name: l.name, slug: l.slug })));
      })
      .catch(() => {});
  }, [locSearch]);

  const isDraft = route.status === 'DRAFT';

  async function handleAddStep() {
    if (!form.stepCode || !form.label || !form.processId || !form.bomId) {
      toast.error('stepCode, label, processId, bomId wajib');
      return;
    }
    if (!form.outputLocationId) {
      toast.error('Output location wajib sebelum publish — isi sekarang');
      // tetap lanjut, server akan validasi
    }
    const res = await addRouteStep({
      routeId: route.id,
      stepCode: form.stepCode.toUpperCase(),
      label: form.label,
      processId: form.processId,
      bomId: form.bomId,
      materialSourceLocationId: form.materialSourceLocationId || null,
      outputLocationId: form.outputLocationId || null,
      allowsPartialHandoff: form.allowsPartialHandoff,
      requiresQualityGate: form.requiresQualityGate,
    });
    if (res.success) {
      toast.success('Step ditambah');
      window.location.reload();
    } else toast.error(res.error || 'Gagal');
  }

  async function handleDeleteStep(stepId: string) {
    if (!confirm('Hapus step ini? Chain output/input akan putus jika tidak hati-hati.')) return;
    const res = await deleteRouteStep(stepId);
    if (res.success) { toast.success('Step dihapus'); window.location.reload(); } else toast.error(res.error || 'Gagal');
  }

  async function handleMove(idx: number, dir: -1 | 1) {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= route.steps.length) return;
    const ordered = [...route.steps].sort((a, b) => a.sequence - b.sequence);
    const tmp = ordered[idx];
    ordered[idx] = ordered[newIdx];
    ordered[newIdx] = tmp;
    const orderedIds = ordered.map((s) => s.id);
    const res = await reorderRouteSteps({ routeId: route.id, orderedIds });
    if (res.success) { toast.success('Urutan diubah'); window.location.reload(); } else toast.error(res.error || 'Gagal reorder');
  }

  async function handleValidate() {
    const res = await validateRouteAction(route.id);
    if (res.success) {
      const v = res.data as { valid: boolean; issues: typeof validationIssues };
      setValidationIssues(v.issues);
      if (v.valid) toast.success('Route valid — siap publish');
      else toast.warning(`${v.issues.length} issue blocking`);
    } else toast.error(res.error || 'Gagal');
  }

  async function handlePublish() {
    const res = await publishRoute(route.id);
    if (res.success) { toast.success('Published'); window.location.reload(); } else toast.error(res.error || 'Gagal publish');
  }

  async function handleArchive() {
    if (!confirm('Archive route ini? Run baru tidak bisa pakai route ini.')) return;
    const res = await archiveRoute(route.id);
    if (res.success) { toast.success('Archived'); window.location.reload(); } else toast.error(res.error || 'Gagal');
  }

  const blockingIssues = validationIssues.filter((i) => i.severity === 'BLOCKING');
  const warningIssues = validationIssues.filter((i) => i.severity === 'WARNING');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/production/routings" className="text-muted-foreground hover:underline">Routing</Link>
        <span>/</span><span className="font-semibold">{route.name}</span>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-lg">{route.name} · v{route.version} · {route.code}</CardTitle>
          <div className="flex gap-1 flex-wrap items-center">
            <Badge>{route.status}</Badge>
            {route.isDefault && <Badge variant="outline">Default</Badge>}
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>Produk: {route.productVariant?.product?.name} {route.productVariant?.name} ({route.productVariant?.skuCode})</div>
          <div className="text-xs text-muted-foreground">
            {route.steps.length} tahap · Input → Process → Output · BOM chain validation sebelum publish
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={handleValidate}>Validasi</Button>
            {isDraft && <Button size="sm" onClick={handlePublish}>Publish</Button>}
            {route.status !== 'ARCHIVED' && <Button size="sm" variant="ghost" onClick={handleArchive}>Archive</Button>}
            <Button size="sm" variant="outline" asChild><Link href="/production/routings/processes">Kelola Process</Link></Button>
          </div>
          {validationIssues.length > 0 && (
            <div className="mt-3 space-y-2">
              {blockingIssues.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-red-700">Blocking ({blockingIssues.length}) — publish dilarang:</div>
                  <div className="space-y-1 mt-1">
                    {blockingIssues.map((iss, i) => (
                      <div key={i} className="text-xs p-2 rounded bg-red-50 text-red-800 border border-red-200 flex gap-1">
                        <span className="font-mono">{iss.code}</span><span>{iss.message}</span>{iss.stepCode && <Badge variant="outline" className="ml-auto text-[10px]">{iss.stepCode}</Badge>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {warningIssues.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-amber-700">Warning ({warningIssues.length}):</div>
                  <div className="space-y-1 mt-1">
                    {warningIssues.map((iss, i) => (
                      <div key={i} className="text-xs p-2 rounded bg-amber-50 text-amber-800 border border-amber-200">{iss.code}: {iss.message}</div>
                    ))}
                  </div>
                </div>
              )}
              {blockingIssues.length === 0 && <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded p-2">✓ Valid — siap publish</div>}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-3">
          <h3 className="font-semibold">Ordered Steps ({route.steps.length}) — sortable list</h3>
          {route.steps.length === 0 ? (
            <div className="text-sm text-muted-foreground p-6 border rounded text-center">Belum ada step. Tambah di panel kanan. Output location wajib untuk publish.</div>
          ) : (
            [...route.steps].sort((a, b) => a.sequence - b.sequence).map((step, idx) => {
              const hasIssue = validationIssues.some((iss) => iss.stepCode === step.stepCode && iss.severity === 'BLOCKING');
              return (
                <Card key={step.id} className={hasIssue ? 'border-red-300 bg-red-50/30' : ''}>
                  <CardContent className="p-3 flex gap-3">
                    <div className="font-mono font-bold text-lg w-6 shrink-0">{idx + 1}</div>
                    <div className="flex-1 space-y-1">
                      <div className="flex gap-2 items-center flex-wrap">
                        <span className="font-semibold">{step.label}</span>
                        <Badge variant="outline" className="text-xs">{step.stepCode}</Badge>
                        <Badge variant="secondary" className="text-xs">{step.process.code}</Badge>
                        {step.process.requiresMachine && <Badge variant="outline" className="text-[10px]">needs machine</Badge>}
                        {hasIssue && <Badge variant="destructive" className="text-[10px]">issue</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">Process: {step.process.name} · BOM: {step.bom.name} · {step.bom.productVariantId.slice(0, 8)}</div>
                      <div className="text-xs">
                        Source: {step.materialSourceLocation?.name ?? step.materialSourceLocationId?.slice(0, 8) ?? '—'} → Output: {step.outputLocation?.name ?? step.outputLocationId?.slice(0, 8) ?? <span className="text-red-600 font-semibold">Wajib isi</span>}
                      </div>
                      <div className="flex gap-2 text-xs">
                        {step.allowsPartialHandoff && <Badge variant="outline" className="text-[10px]">Partial handoff aktif</Badge>}
                        {step.requiresQualityGate && <Badge variant="outline" className="text-[10px]">QC gate</Badge>}
                      </div>
                    </div>
                    {isDraft && (
                      <div className="flex flex-col gap-1">
                        <Button size="sm" variant="outline" disabled={idx === 0} onClick={() => handleMove(idx, -1)}>↑ Naik</Button>
                        <Button size="sm" variant="outline" disabled={idx === route.steps.length - 1} onClick={() => handleMove(idx, 1)}>↓ Turun</Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDeleteStep(step.id)}>Hapus</Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        {isDraft && (
          <div className="space-y-4">
            <Card className="sticky top-4">
              <CardHeader><CardTitle className="text-base">Tambah Tahap</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div><Label>Step Code (UPPER_SNAKE)</Label><Input value={form.stepCode} onChange={(e) => setForm({ ...form, stepCode: e.target.value })} placeholder="PACK_PRIMER, STERIL, CARTON" /></div>
                <div><Label>Label Tahap</Label><Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Packing Primer / Sterilization" /></div>

                <div>
                  <Label>Process</Label>
                  <Input value={procSearch} onChange={(e) => setProcSearch(e.target.value)} placeholder="Cari process code/nama" className="text-xs" />
                  <div className="border rounded max-h-32 overflow-auto mt-1 divide-y">
                    {processes.map((p) => (
                      <button key={p.id} type="button" onClick={() => setForm({ ...form, processId: p.id })} className={`w-full text-left px-2 py-1 text-xs hover:bg-muted ${form.processId === p.id ? 'bg-muted font-semibold' : ''}`}>
                        {p.code} — {p.name}
                      </button>
                    ))}
                  </div>
                  <Input value={form.processId} onChange={(e) => setForm({ ...form, processId: e.target.value })} placeholder="Atau paste process UUID" className="text-[10px] font-mono mt-1" />
                </div>

                <div>
                  <Label>BOM (output = WIP/FG tahap ini)</Label>
                  <Input value={bomSearch} onChange={(e) => setBomSearch(e.target.value)} placeholder="Cari BOM name" className="text-xs" />
                  <div className="border rounded max-h-32 overflow-auto mt-1 divide-y">
                    {boms.map((b) => (
                      <button key={b.id} type="button" onClick={() => setForm({ ...form, bomId: b.id })} className={`w-full text-left px-2 py-1 text-xs hover:bg-muted ${form.bomId === b.id ? 'bg-muted font-semibold' : ''}`}>
                        <span className="font-mono">{b.skuCode}</span> {b.name}
                      </button>
                    ))}
                  </div>
                  <Input value={form.bomId} onChange={(e) => setForm({ ...form, bomId: e.target.value })} placeholder="Atau paste BOM UUID" className="text-[10px] font-mono mt-1" />
                </div>

                <div>
                  <Label>Source Location</Label>
                  <Input value={locSearch} onChange={(e) => setLocSearch(e.target.value)} placeholder="Cari lokasi" className="text-xs" />
                  <div className="border rounded max-h-28 overflow-auto mt-1 divide-y">
                    {locs.map((l) => (
                      <button key={l.id} type="button" onClick={() => { if (form.materialSourceLocationId === '') setForm({ ...form, materialSourceLocationId: l.id }); else if (form.outputLocationId === '') setForm({ ...form, outputLocationId: l.id }); }} className="w-full text-left px-2 py-1 text-xs hover:bg-muted">
                        {l.name} <span className="text-muted-foreground">({l.slug})</span>
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-1 mt-1">
                    <Input value={form.materialSourceLocationId} onChange={(e) => setForm({ ...form, materialSourceLocationId: e.target.value })} placeholder="Source loc UUID" className="text-[10px] font-mono" />
                    <Input value={form.outputLocationId} onChange={(e) => setForm({ ...form, outputLocationId: e.target.value })} placeholder="Output loc UUID (wajib)" className="text-[10px] font-mono" />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">Klik lokasi di list: pertama → source, kedua → output. Output wajib untuk publish.</p>
                </div>

                <div className="flex gap-4">
                  <label className="text-xs flex gap-1 items-center"><input type="checkbox" checked={form.allowsPartialHandoff} onChange={(e) => setForm({ ...form, allowsPartialHandoff: e.target.checked })} /> Partial handoff</label>
                  <label className="text-xs flex gap-1 items-center"><input type="checkbox" checked={form.requiresQualityGate} onChange={(e) => setForm({ ...form, requiresQualityGate: e.target.checked })} /> QC gate</label>
                </div>
                <Button onClick={handleAddStep} className="w-full">Tambah Step</Button>
                <p className="text-[10px] text-muted-foreground">Validator cek: output chain, last=FG, risky location, capability.</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">Route Flow Preview</CardTitle></CardHeader>
              <CardContent className="text-xs space-y-1">
                {route.steps.length === 0 ? <span className="text-muted-foreground">—</span> :
                  [...route.steps].sort((a, b) => a.sequence - b.sequence).map((s, i) => (
                    <div key={s.id} className="flex gap-1">
                      <span className="font-mono">{i + 1}.</span><span>{s.bom.productVariantId.slice(0, 6)}</span><span className="text-muted-foreground">→ {s.process.code} →</span><span className="font-semibold">{s.label}</span>
                    </div>
                  ))
                }
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
