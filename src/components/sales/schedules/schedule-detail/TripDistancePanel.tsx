'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { listRouteDistances, saveTripDistancePlan, startTripMileage, finishTripMileage } from '@/actions/sales/trip-distance';
import { actualTripDistance, readDistanceLegs, totalRouteDistance } from '@/lib/sales/trip-distance';
import type { RouteDistanceOption } from '@/components/sales/RouteDistanceManager';
import type { Trip } from './types';

export function TripDistancePanel({ trip }: { trip: Trip }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [routes, setRoutes] = useState<RouteDistanceOption[]>([]);
    const [selected, setSelected] = useState<string[]>([]);
    const [choice, setChoice] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [driver, setDriver] = useState(trip.vehicle?.driverName ?? '');
    const [start, setStart] = useState('');
    const [end, setEnd] = useState('');
    const mileage = trip.mileage;
    const canPlan = ['PLANNED', 'CONFIRMED'].includes(trip.status) && !mileage;
    const canRecord = ['DEPARTED', 'COMPLETED'].includes(trip.status);
    const legs = readDistanceLegs(trip.distanceLegs);
    const actual = mileage ? actualTripDistance(mileage.odometerStart, mileage.odometerEnd) : null;
    const selectedLegs = selected.map((id) => routes.find((r) => r.id === id)).filter((r): r is RouteDistanceOption => Boolean(r));
    let preview: number | null = null;
    let previewError = '';
    if (selectedLegs.length) {
        try { preview = totalRouteDistance(selectedLegs.map((r) => ({ ...r, routeId: r.id }))); }
        catch { previewError = 'Ruas belum tersambung sesuai urutan. Hapus ruas terakhir atau tambahkan ruas yang sesuai.'; }
    }
    async function loadRoutes() {
        setBusy(true); setError('');
        try {
            const result = await listRouteDistances();
            if (!result.success) setError(result.error);
            else { setRoutes(result.data); setSelected(legs.map((l) => l.routeId)); }
        } catch { setError('Gagal memuat patokan jarak. Silakan coba lagi.'); }
        finally { setBusy(false); }
    }
    async function mutate(action: () => Promise<{ success: boolean; error?: string }>) {
        setBusy(true); setError(''); setNotice('');
        try {
            const result = await action();
            if (!result.success) { setError(result.error || 'Gagal menyimpan.'); return; }
            setNotice('Catatan perjalanan tersimpan.'); router.refresh();
        } catch { setError('Gagal menyimpan. Silakan coba lagi.'); }
        finally { setBusy(false); }
    }
    if (trip.vehicle?.ownershipType !== 'FACTORY' && !mileage) return null;
    return <section className="mt-4 rounded-md border p-3 space-y-3" aria-label="Jarak perjalanan">
        <div className="flex flex-wrap justify-between gap-2 text-sm">
            <span>Rencana: <strong>{trip.plannedDistanceKm == null ? 'Belum diisi' : `${trip.plannedDistanceKm.toLocaleString('id-ID')} km`}</strong></span>
            <span>Aktual: <strong>{actual == null ? 'Belum lengkap' : `${actual.toLocaleString('id-ID')} km`}</strong></span>
        </div>
        {legs.length > 0 && <p className="text-xs text-muted-foreground break-words">{[legs[0].originAddress, ...legs.map((l) => l.destinationAddress)].join(' → ')}</p>}
        {mileage && <p className="text-xs text-muted-foreground">Sopir: {mileage.driverName} · Odometer {mileage.odometerStart.toLocaleString('id-ID')} → {mileage.odometerEnd?.toLocaleString('id-ID') ?? 'belum diisi'} km</p>}
        {actual !== null && trip.plannedDistanceKm != null && <p className="text-xs">Selisih aktual − rencana: {(Math.round((actual - trip.plannedDistanceKm) * 100) / 100).toLocaleString('id-ID')} km</p>}
        <Button size="sm" variant="outline" aria-expanded={open} onClick={() => { setOpen(!open); if (!open && canPlan) void loadRoutes(); }}>{open ? 'Tutup kilometer' : 'Kelola kilometer'}</Button>
        {open && <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Satu catatan per rit, bukan per surat jalan. Rencana tidak menambah odometer. Catatan aktual yang disimpan tidak dapat ditimpa.</p>
            {canPlan && <>
                <Link href="/sales/tariffs" className="text-sm underline">Kelola master ruas jalan</Link>
                <div className="space-y-1"><Label htmlFor={`route-${trip.id}`}>Tambah ruas sesuai urutan (termasuk pulang)</Label>
                    <select id={`route-${trip.id}`} className="h-11 w-full min-w-0 rounded-md border bg-background px-2 text-sm" value={choice} onChange={(e) => setChoice(e.target.value)} disabled={busy}>
                        <option value="">Pilih ruas jalan…</option>{routes.map((r) => <option key={r.id} value={r.id}>{r.originAddress} → {r.destinationAddress} · {r.distanceKm} km</option>)}
                    </select>
                </div>
                <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={!choice || busy} onClick={() => { setSelected([...selected, choice]); setChoice(''); }}>Tambah ruas</Button><Button size="sm" variant="ghost" disabled={!selected.length || busy} onClick={() => setSelected(selected.slice(0, -1))}>Hapus ruas terakhir</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => void loadRoutes()}>Muat ulang ruas</Button></div>
                <ol className="list-decimal pl-5 text-sm space-y-1">{selectedLegs.map((r, i) => <li key={`${i}-${r.id}`} className="break-words">{r.originAddress} → {r.destinationAddress} · {r.distanceKm} km</li>)}</ol>
                {previewError && <p className="text-sm text-destructive">{previewError}</p>}
                {preview != null && <p className="text-sm">Total rencana: <strong>{preview.toLocaleString('id-ID')} km</strong></p>}
                <Button size="sm" disabled={busy || preview == null} onClick={() => void mutate(() => saveTripDistancePlan({ tripId: trip.id, routeIds: selected }))}>Simpan rencana jarak</Button>
            </>}
            {canRecord && !mileage && <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void mutate(() => startTripMileage({ tripId: trip.id, driverName: driver, odometerStart: start === '' ? null : Number(start) })); }}>
                <div className="space-y-1"><Label htmlFor={`driver-${trip.id}`}>Sopir perjalanan ini</Label><Input id={`driver-${trip.id}`} required maxLength={150} value={driver} onChange={(e) => setDriver(e.target.value)} /></div>
                <div className="space-y-1"><Label htmlFor={`start-${trip.id}`}>Odometer saat berangkat (km)</Label><Input id={`start-${trip.id}`} required type="number" min="0" step="0.01" value={start} onChange={(e) => setStart(e.target.value)} /></div>
                <Button size="sm" type="submit" disabled={busy}>Simpan odometer awal</Button>
            </form>}
            {canRecord && mileage && mileage.odometerEnd === null && <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void mutate(() => finishTripMileage({ tripId: trip.id, odometerEnd: end === '' ? null : Number(end) })); }}>
                <div className="space-y-1"><Label htmlFor={`end-${trip.id}`}>Odometer saat kembali (km)</Label><Input id={`end-${trip.id}`} required type="number" min={mileage.odometerStart} step="0.01" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
                <p className="text-xs text-muted-foreground">Isi setelah mobil kembali, bukan hanya setelah barang diterima customer.</p>
                <Button size="sm" type="submit" disabled={busy}>Simpan odometer akhir</Button>
            </form>}
            {!canRecord && !canPlan && <p className="text-sm text-muted-foreground">Catatan trip ini hanya dapat dilihat.</p>}
            {busy && <p role="status" className="text-sm">Memproses…</p>}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            {notice && <p role="status" className="text-sm">{notice}</p>}
        </div>}
    </section>;
}
