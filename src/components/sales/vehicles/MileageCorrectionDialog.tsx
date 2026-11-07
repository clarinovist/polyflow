'use client';

import { useState } from 'react';
import { correctVehicleMileage } from '@/actions/sales/vehicle-mileage';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { parseKmText } from '@/lib/sales/vehicle-mileage';
import { useMileageAction } from './useMileageAction';

const MIN_REASON_LENGTH = 5;

export interface CorrectionTarget {
    mileageId: string;
    label: string;
    driverName: string;
    odometerStart: number;
    odometerEnd: number | null;
}
interface Props { target: CorrectionTarget | null; onClose: () => void; onSaved: () => void }

export function MileageCorrectionDialog({ target, onClose, onSaved }: Props) {
    return <Dialog open={target !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
            {target && <CorrectionForm key={target.mileageId} target={target} onClose={onClose} onSaved={onSaved} />}
        </DialogContent>
    </Dialog>;
}

function CorrectionForm({ target, onClose, onSaved }: { target: CorrectionTarget; onClose: () => void; onSaved: () => void }) {
    const [driver, setDriver] = useState(target.driverName);
    const [start, setStart] = useState(String(target.odometerStart));
    const [end, setEnd] = useState(target.odometerEnd === null ? '' : String(target.odometerEnd));
    const [reason, setReason] = useState('');
    const { busy, error, setError, run } = useMileageAction();
    const isOpenRecord = target.odometerEnd === null;
    async function submit() {
        const odometerStart = parseKmText(start);
        const odometerEnd = parseKmText(end);
        if (odometerStart === null) { setError('KM berangkat wajib diisi dengan angka.'); return; }
        if (odometerEnd === null && !isOpenRecord) { setError('KM kembali wajib diisi untuk catatan yang sudah kembali.'); return; }
        if (reason.trim().length < MIN_REASON_LENGTH) { setError(`Alasan koreksi wajib diisi (minimal ${MIN_REASON_LENGTH} karakter).`); return; }
        const saved = await run(() => correctVehicleMileage({ mileageId: target.mileageId, driverName: driver, odometerStart, odometerEnd, reason }));
        if (saved) { onSaved(); onClose(); }
    }
    return <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <DialogHeader>
            <DialogTitle>Koreksi KM</DialogTitle>
            <DialogDescription>{target.label}. Koreksi tercatat di audit beserta alasannya.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1"><Label htmlFor="correct-driver">Sopir</Label>
            <Input id="correct-driver" className="h-11" value={driver} onChange={(e) => setDriver(e.target.value)} maxLength={150} disabled={busy} /></div>
        <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label htmlFor="correct-start">KM berangkat</Label>
                <Input id="correct-start" className="h-11" inputMode="decimal" value={start} onChange={(e) => setStart(e.target.value)} disabled={busy} /></div>
            <div className="space-y-1"><Label htmlFor="correct-end">KM kembali</Label>
                <Input id="correct-end" className="h-11" inputMode="decimal" value={end} onChange={(e) => setEnd(e.target.value)} disabled={busy} placeholder={isOpenRecord ? 'Belum kembali' : undefined} /></div>
        </div>
        <div className="space-y-1"><Label htmlFor="correct-reason">Alasan koreksi (wajib)</Label>
            <Textarea id="correct-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} disabled={busy} /></div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
            <Button type="button" variant="outline" className="min-h-11" onClick={onClose} disabled={busy}>Batal</Button>
            <Button type="submit" className="min-h-11" disabled={busy}>Simpan koreksi</Button>
        </DialogFooter>
    </form>;
}
