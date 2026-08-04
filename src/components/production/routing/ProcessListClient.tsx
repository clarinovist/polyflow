'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createProcess, updateProcess, deleteProcess, addMachineCapability, removeMachineCapability } from '@/actions/production/production-routings';
import { toast } from 'sonner';

type Proc = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  requiresMachine: boolean;
  requiresQualityGate: boolean;
  executionMode?: string | null;
  isActive: boolean;
  _count?: { capabilities: number; routeSteps: number };
};

type Cap = { id: string; machineId: string; processId: string; machine?: { name: string; code: string }; process?: { code: string; name: string } };

export function ProcessListClient({ initialProcesses, initialCapabilities }: { initialProcesses: Proc[]; initialCapabilities: Cap[] }) {
  const [processes] = useState(initialProcesses);
  const [caps] = useState(initialCapabilities);
  const [form, setForm] = useState({ code: '', name: '', description: '', requiresMachine: false, requiresQualityGate: false, executionMode: 'GENERIC' as 'GENERIC' | 'INDIVIDUAL_OUTPUT' | 'MATERIAL_CONVERSION' });
  const [capForm, setCapForm] = useState({ machineId: '', processId: '' });

  async function handleCreate() {
    if (!form.code || !form.name) { toast.error('Code & name wajib'); return; }
    const res = await createProcess({ code: form.code.toUpperCase(), name: form.name, description: form.description || null, requiresMachine: form.requiresMachine, requiresQualityGate: form.requiresQualityGate, executionMode: form.executionMode });
    if (res.success) { toast.success('Process dibuat'); window.location.reload(); } else toast.error(res.error || 'Gagal');
  }

  async function handleToggleActive(p: Proc) {
    const res = await updateProcess({ id: p.id, isActive: !p.isActive });
    if (res.success) { toast.success('Updated'); window.location.reload(); } else toast.error(res.error || 'Gagal');
  }

  async function handleDelete(id: string) {
    if (!confirm('Hapus process?')) return;
    const res = await deleteProcess(id);
    if (res.success) { toast.success('Dihapus'); window.location.reload(); } else toast.error(res.error || 'Gagal');
  }

  async function handleAddCap() {
    if (!capForm.machineId || !capForm.processId) { toast.error('Machine & Process wajib'); return; }
    const res = await addMachineCapability({ machineId: capForm.machineId, processId: capForm.processId, isPrimary: false });
    if (res.success) { toast.success('Capability ditambah'); window.location.reload(); } else toast.error(res.error || 'Gagal');
  }

  async function handleRemoveCap(machineId: string, processId: string) {
    const res = await removeMachineCapability(machineId, processId);
    if (res.success) { toast.success('Capability dihapus'); window.location.reload(); } else toast.error(res.error || 'Gagal');
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-base">Buat Process Baru</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid md:grid-cols-3 gap-3">
            <div><Label>Code (UPPER_SNAKE)</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="STERILIZATION" /></div>
            <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Sterilization" /></div>
            <div><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          </div>
          <div className="flex gap-4">
            <label className="text-sm flex gap-1 items-center"><input type="checkbox" checked={form.requiresMachine} onChange={(e) => setForm({ ...form, requiresMachine: e.target.checked })} /> Requires Machine</label>
            <label className="text-sm flex gap-1 items-center"><input type="checkbox" checked={form.requiresQualityGate} onChange={(e) => setForm({ ...form, requiresQualityGate: e.target.checked })} /> QC Gate</label>
          </div>
          <div>
            <Label>Execution Mode</Label>
            <select value={form.executionMode} onChange={(e) => setForm({ ...form, executionMode: e.target.value as 'GENERIC' | 'INDIVIDUAL_OUTPUT' | 'MATERIAL_CONVERSION' })} className="w-full md:w-72 h-9 rounded-md border border-input bg-transparent px-3 text-sm">
              <option value="GENERIC">Generic (kiosk normal)</option>
              <option value="INDIVIDUAL_OUTPUT">Hasil Individu (per operator)</option>
              <option value="MATERIAL_CONVERSION">Konversi Material (BOM preview)</option>
            </select>
            <p className="text-xs text-muted-foreground">Hasil Individu: output melekat ke operator kiosk. Konversi Material: output + preview konsumsi WIP dari BOM.</p>
          </div>
          <Button onClick={handleCreate}>Buat Process</Button>
          <p className="text-xs text-muted-foreground">Contoh: MIXING, EXTRUSION, INNER_PACKING, STERILIZATION, CARTON_PACKING, INJECTION, WINDING</p>
        </CardContent>
      </Card>

      <div className="grid gap-3">
        {processes.map((p) => (
          <Card key={p.id}>
            <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-2">
              <div>
                <div className="flex gap-2 items-center flex-wrap">
                  <span className="font-mono font-bold">{p.code}</span>
                  <span>{p.name}</span>
                  <Badge variant={p.isActive ? 'default' : 'secondary'}>{p.isActive ? 'Aktif' : 'Nonaktif'}</Badge>
                  {p.requiresMachine && <Badge variant="outline">needs machine</Badge>}
                  {p.requiresQualityGate && <Badge variant="outline">QC</Badge>}
                  {p.executionMode === 'INDIVIDUAL_OUTPUT' && <Badge variant="secondary">Hasil Individu</Badge>}
                  {p.executionMode === 'MATERIAL_CONVERSION' && <Badge variant="secondary">Konversi Material</Badge>}
                  <span className="text-xs text-muted-foreground">{p._count?.capabilities ?? 0} mesin · {p._count?.routeSteps ?? 0} steps</span>
                </div>
                {p.description && <div className="text-xs text-muted-foreground">{p.description}</div>}
              </div>
              <div className="flex gap-1 items-center">
                <select
                  value={p.executionMode ?? 'GENERIC'}
                  onChange={async (e) => {
                    const res = await updateProcess({ id: p.id, executionMode: e.target.value as 'GENERIC' | 'INDIVIDUAL_OUTPUT' | 'MATERIAL_CONVERSION' });
                    if (res.success) { toast.success('Mode updated'); window.location.reload(); } else toast.error(res.error || 'Gagal');
                  }}
                  className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
                  title="Execution Mode"
                >
                  <option value="GENERIC">Generic</option>
                  <option value="INDIVIDUAL_OUTPUT">Hasil Individu</option>
                  <option value="MATERIAL_CONVERSION">Konversi Material</option>
                </select>
                <Button size="sm" variant="outline" onClick={() => handleToggleActive(p)}>{p.isActive ? 'Nonaktifkan' : 'Aktifkan'}</Button>
                <Button size="sm" variant="ghost" onClick={() => handleDelete(p.id)}>Hapus</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Machine Capability</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            <Input placeholder="Machine ID" value={capForm.machineId} onChange={(e) => setCapForm({ ...capForm, machineId: e.target.value })} className="w-64" />
            <Input placeholder="Process ID" value={capForm.processId} onChange={(e) => setCapForm({ ...capForm, processId: e.target.value })} className="w-64" />
            <Button size="sm" onClick={handleAddCap}>Tambah Capability</Button>
          </div>
          <div className="space-y-1 max-h-96 overflow-auto">
            {caps.map((c) => (
              <div key={c.id} className="text-xs flex gap-2 items-center justify-between border-b py-1">
                <span>{c.machine?.code ?? c.machineId} → {c.process?.code ?? c.processId}</span>
                <Button size="sm" variant="ghost" onClick={() => handleRemoveCap(c.machineId, c.processId)}>Hapus</Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
