'use client';

import { useState, type ReactNode } from 'react';
import { correctVehicleService, recordVehicleService } from '@/actions/sales/vehicle-service';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { parseKmText } from '@/lib/sales/vehicle-mileage';
import { toWibDateInput } from '@/lib/sales/vehicle-service';
import { useMileageAction } from './useMileageAction';

const MIN_REASON_LENGTH = 5;

export interface RecordTarget { vehicleId: string; itemId: string; label: string; suggestedKm: number | null }
export interface ServiceCorrectionTarget { recordId: string; label: string; servicedAt: string; odometerKm: number; note: string | null }

function DialogShell({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
    return <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">{children}</DialogContent>
    </Dialog>;
}

interface FieldsProps { prefix: string; date: string; km: string; note: string; busy: boolean; today: string;
    onDate: (value: string) => void; onKm: (value: string) => void; onNote: (value: string) => void }

function ServiceFields({ prefix, date, km, note, busy, today, onDate, onKm, onNote }: FieldsProps) {
    return <>
        <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label htmlFor={`${prefix}-date`}>Tanggal servis</Label>
                <Input id={`${prefix}-date`} className="h-11" type="date" max={today} value={date} onChange={(e) => onDate(e.target.value)} disabled={busy} /></div>
            <div className="space-y-1"><Label htmlFor={`${prefix}-km`}>KM saat servis</Label>
                <Input id={`${prefix}-km`} className="h-11" inputMode="decimal" value={km} onChange={(e) => onKm(e.target.value)} disabled={busy} /></div>
        </div>
        <div className="space-y-1"><Label htmlFor={`${prefix}-note`}>Keterangan (opsional)</Label>
            <Input id={`${prefix}-note`} className="h-11" value={note} onChange={(e) => onNote(e.target.value)} maxLength={300} disabled={busy} /></div>
    </>;
}

export function ServiceRecordDialog({ target, onClose, onSaved }: { target: RecordTarget | null; onClose: () => void; onSaved: () => void }) {
    return <DialogShell open={target !== null} onClose={onClose}>
        {target && <RecordForm key={target.itemId} target={target} onClose={onClose} onSaved={onSaved} />}
    </DialogShell>;
}

function RecordForm({ target, onClose, onSaved }: { target: RecordTarget; onClose: () => void; onSaved: () => void }) {
    const today = toWibDateInput(new Date());
    const [date, setDate] = useState(today);
    const [km, setKm] = useState(target.suggestedKm === null ? '' : String(target.suggestedKm));
    const [note, setNote] = useState('');
    const { busy, error, setError, run } = useMileageAction();
    async function submit() {
        const odometerKm = parseKmText(km);
        if (!date) { setError('Tanggal servis wajib diisi.'); return; }
        if (odometerKm === null) { setError('KM saat servis wajib diisi dengan angka.'); return; }
        const saved = await run(() => recordVehicleService({ vehicleId: target.vehicleId, serviceItemId: target.itemId, servicedAt: date, odometerKm, note }));
        if (saved) { onSaved(); onClose(); }
    }
    return <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <DialogHeader>
            <DialogTitle>Catat servis: {target.label}</DialogTitle>
            <DialogDescription>KM disarankan dari catatan KM terakhir truk; ubah sesuai odometer saat servis.</DialogDescription>
        </DialogHeader>
        <ServiceFields prefix="service-record" date={date} km={km} note={note} busy={busy} today={today} onDate={setDate} onKm={setKm} onNote={setNote} />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
            <Button type="button" variant="outline" className="min-h-11" onClick={onClose} disabled={busy}>Batal</Button>
            <Button type="submit" className="min-h-11" disabled={busy}>Simpan servis</Button>
        </DialogFooter>
    </form>;
}

export function ServiceCorrectionDialog({ target, onClose, onSaved }: { target: ServiceCorrectionTarget | null; onClose: () => void; onSaved: () => void }) {
    return <DialogShell open={target !== null} onClose={onClose}>
        {target && <CorrectionForm key={target.recordId} target={target} onClose={onClose} onSaved={onSaved} />}
    </DialogShell>;
}

function CorrectionForm({ target, onClose, onSaved }: { target: ServiceCorrectionTarget; onClose: () => void; onSaved: () => void }) {
    const today = toWibDateInput(new Date());
    const [date, setDate] = useState(toWibDateInput(new Date(target.servicedAt)));
    const [km, setKm] = useState(String(target.odometerKm));
    const [note, setNote] = useState(target.note ?? '');
    const [reason, setReason] = useState('');
    const { busy, error, setError, run } = useMileageAction();
    async function submit() {
        const odometerKm = parseKmText(km);
        if (!date) { setError('Tanggal servis wajib diisi.'); return; }
        if (odometerKm === null) { setError('KM saat servis wajib diisi dengan angka.'); return; }
        if (reason.trim().length < MIN_REASON_LENGTH) { setError(`Alasan koreksi wajib diisi (minimal ${MIN_REASON_LENGTH} karakter).`); return; }
        const saved = await run(() => correctVehicleService({ recordId: target.recordId, servicedAt: date, odometerKm, note, reason }));
        if (saved) { onSaved(); onClose(); }
    }
    return <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <DialogHeader>
            <DialogTitle>Koreksi servis</DialogTitle>
            <DialogDescription>{target.label}. Koreksi tercatat di audit beserta alasannya.</DialogDescription>
        </DialogHeader>
        <ServiceFields prefix="service-correct" date={date} km={km} note={note} busy={busy} today={today} onDate={setDate} onKm={setKm} onNote={setNote} />
        <div className="space-y-1"><Label htmlFor="service-correct-reason">Alasan koreksi (wajib)</Label>
            <Textarea id="service-correct-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} disabled={busy} /></div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
            <Button type="button" variant="outline" className="min-h-11" onClick={onClose} disabled={busy}>Batal</Button>
            <Button type="submit" className="min-h-11" disabled={busy}>Simpan koreksi</Button>
        </DialogFooter>
    </form>;
}
