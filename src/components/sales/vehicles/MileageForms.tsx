'use client';

import { useState } from 'react';
import { finishVehicleMileage, startVehicleMileage } from '@/actions/sales/vehicle-mileage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatFleetKm } from '@/lib/sales/fleet-summary';
import { parseKmText } from '@/lib/sales/vehicle-mileage';
import { useMileageAction } from './useMileageAction';

const FIELD = 'h-11';
const BUTTON = 'min-h-11 w-full sm:w-auto';

interface StartFormProps { vehicleId: string; defaultDriver: string | null; suggestedKm: number | null; onSaved: () => void }

export function MileageStartForm({ vehicleId, defaultDriver, suggestedKm, onSaved }: StartFormProps) {
    const [driver, setDriver] = useState(defaultDriver ?? '');
    const [km, setKm] = useState(suggestedKm === null ? '' : String(suggestedKm));
    const [note, setNote] = useState('');
    const { busy, error, setError, run } = useMileageAction();
    async function submit() {
        const odometerStart = parseKmText(km);
        if (odometerStart === null) { setError('KM berangkat wajib diisi dengan angka.'); return; }
        if (await run(() => startVehicleMileage({ vehicleId, driverName: driver, odometerStart, note }))) onSaved();
    }
    return <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <div className="space-y-1"><Label htmlFor={`driver-${vehicleId}`}>Sopir</Label>
            <Input id={`driver-${vehicleId}`} className={FIELD} value={driver} onChange={(e) => setDriver(e.target.value)} maxLength={150} disabled={busy} /></div>
        <div className="space-y-1"><Label htmlFor={`km-start-${vehicleId}`}>KM berangkat</Label>
            <Input id={`km-start-${vehicleId}`} className={FIELD} inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} disabled={busy} /></div>
        <div className="space-y-1"><Label htmlFor={`note-${vehicleId}`}>Keterangan (opsional)</Label>
            <Input id={`note-${vehicleId}`} className={FIELD} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} disabled={busy} /></div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className={BUTTON} disabled={busy}>Simpan berangkat</Button>
    </form>;
}

interface FinishFormProps { mileageId: string; odometerStart: number; onSaved: () => void }

export function MileageFinishForm({ mileageId, odometerStart, onSaved }: FinishFormProps) {
    const [km, setKm] = useState('');
    const { busy, error, setError, run } = useMileageAction();
    const odometerEnd = parseKmText(km);
    const travelled = odometerEnd !== null && odometerEnd >= odometerStart ? Math.round((odometerEnd - odometerStart) * 100) / 100 : null;
    async function submit() {
        if (odometerEnd === null) { setError('KM kembali wajib diisi dengan angka.'); return; }
        if (await run(() => finishVehicleMileage({ mileageId, odometerEnd }))) onSaved();
    }
    return <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <div className="space-y-1"><Label htmlFor={`km-end-${mileageId}`}>KM kembali</Label>
            <Input id={`km-end-${mileageId}`} className={FIELD} inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} disabled={busy} /></div>
        {travelled !== null && <p className="text-sm">KM tempuh: <strong>{formatFleetKm(travelled)}</strong></p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className={BUTTON} disabled={busy}>Simpan kembali</Button>
    </form>;
}
