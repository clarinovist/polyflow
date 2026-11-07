'use client';

import { useRef, useState } from 'react';
import { createServiceItem, updateServiceItem } from '@/actions/sales/vehicle-service';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { parseKmText } from '@/lib/sales/vehicle-mileage';
import { SERVICE_LABEL_OTHER, SERVICE_LABEL_SUGGESTIONS } from '@/lib/sales/vehicle-service';
import type { ServiceItemView } from '@/services/sales/vehicle-service-service';
import { useMileageAction } from './useMileageAction';

export type ServiceItemTarget = { mode: 'create'; vehicleId: string } | { mode: 'edit'; item: ServiceItemView };
interface Props { target: ServiceItemTarget | null; onClose: () => void; onSaved: () => void }

export function ServiceItemDialog({ target, onClose, onSaved }: Props) {
    return <Dialog open={target !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
            {target && <ItemForm key={target.mode === 'edit' ? target.item.id : 'new'} target={target} onClose={onClose} onSaved={onSaved} />}
        </DialogContent>
    </Dialog>;
}

const textOf = (value: number | null) => (value === null ? '' : String(value));

/** Empty text is "not given" (undefined); text that is not a number is flagged (null). */
function optionalNumber(text: string): number | null | undefined {
    return text.trim() === '' ? undefined : parseKmText(text);
}

function ItemForm({ target, onClose, onSaved }: { target: ServiceItemTarget; onClose: () => void; onSaved: () => void }) {
    const item = target.mode === 'edit' ? target.item : null;
    const labelRef = useRef<HTMLInputElement>(null);
    const [label, setLabel] = useState(item?.label ?? '');
    const [intervalKm, setIntervalKm] = useState(textOf(item?.intervalKm ?? null));
    const [intervalDays, setIntervalDays] = useState(textOf(item?.intervalDays ?? null));
    const [warnKm, setWarnKm] = useState(textOf(item?.warnKm ?? null));
    const [isActive, setIsActive] = useState(item?.isActive ?? true);
    const { busy, error, setError, run } = useMileageAction();
    function pick(suggestion: string) {
        if (suggestion === SERVICE_LABEL_OTHER) { setLabel(''); labelRef.current?.focus(); return; }
        setLabel(suggestion);
    }
    async function submit() {
        const km = parseKmText(intervalKm);
        const days = optionalNumber(intervalDays);
        const warn = optionalNumber(warnKm);
        if (km === null) { setError('Interval KM wajib diisi dengan angka.'); return; }
        if (days === null) { setError('Interval hari harus berupa angka atau dikosongkan.'); return; }
        if (warn === null) { setError('Jarak peringatan harus berupa angka atau dikosongkan.'); return; }
        const common = { intervalKm: km, intervalDays: days ?? null, warnKm: warn };
        const saved = await run(() => target.mode === 'edit'
            ? updateServiceItem({ itemId: target.item.id, ...common, isActive })
            : createServiceItem({ vehicleId: target.vehicleId, label, ...common }));
        if (saved) { onSaved(); onClose(); }
    }
    return <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <DialogHeader>
            <DialogTitle>{item ? `Ubah interval: ${item.label}` : 'Tambah jenis servis'}</DialogTitle>
            <DialogDescription>Interval diisi per truk sesuai buku servis atau saran bengkel. Perubahan tercatat di audit.</DialogDescription>
        </DialogHeader>
        {!item && <div className="space-y-2">
            <p className="text-sm font-medium">Pilihan cepat</p>
            <div className="flex flex-wrap gap-2">
                {SERVICE_LABEL_SUGGESTIONS.map((suggestion) => <Button key={suggestion} type="button" variant="outline" className="min-h-11" aria-pressed={label === suggestion} disabled={busy} onClick={() => pick(suggestion)}>{suggestion}</Button>)}
            </div>
            <div className="space-y-1"><Label htmlFor="service-label">Nama jenis servis</Label>
                <Input id="service-label" ref={labelRef} className="h-11" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} disabled={busy} /></div>
        </div>}
        <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label htmlFor="service-interval-km">Interval KM</Label>
                <Input id="service-interval-km" className="h-11" inputMode="decimal" value={intervalKm} onChange={(e) => setIntervalKm(e.target.value)} disabled={busy} /></div>
            <div className="space-y-1"><Label htmlFor="service-interval-days">Interval hari (opsional)</Label>
                <Input id="service-interval-days" className="h-11" inputMode="numeric" value={intervalDays} onChange={(e) => setIntervalDays(e.target.value)} disabled={busy} /></div>
        </div>
        <div className="space-y-1"><Label htmlFor="service-warn-km">Peringatan sebelum jatuh tempo (km, opsional)</Label>
            <Input id="service-warn-km" className="h-11" inputMode="decimal" value={warnKm} onChange={(e) => setWarnKm(e.target.value)} disabled={busy} placeholder="Otomatis 10% dari interval" /></div>
        {item && <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} disabled={busy} />
            Pantau jenis servis ini (hilangkan centang untuk menonaktifkan; riwayat tetap tersimpan)
        </label>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
            <Button type="button" variant="outline" className="min-h-11" onClick={onClose} disabled={busy}>Batal</Button>
            <Button type="submit" className="min-h-11" disabled={busy}>{item ? 'Simpan interval' : 'Tambah jenis servis'}</Button>
        </DialogFooter>
    </form>;
}
