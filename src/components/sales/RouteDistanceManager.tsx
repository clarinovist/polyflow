'use client';

import { useState } from 'react';
import { listRouteDistances, saveRouteDistance } from '@/actions/sales/trip-distance';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type RouteDistanceOption = { id: string; originAddress: string; destinationAddress: string; distanceKm: number };

export function RouteDistanceManager() {
    const [open, setOpen] = useState(false);
    const [routes, setRoutes] = useState<RouteDistanceOption[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [origin, setOrigin] = useState('');
    const [destination, setDestination] = useState('');
    const [distance, setDistance] = useState('');

    async function load() {
        setLoading(true); setError('');
        try {
            const result = await listRouteDistances();
            if (!result.success) setError(result.error);
            else setRoutes(result.data);
        } catch { setError('Gagal memuat ruas jalan. Silakan coba lagi.'); }
        finally { setLoading(false); }
    }
    async function save(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault(); setLoading(true); setError(''); setNotice('');
        try {
            const result = await saveRouteDistance({ originAddress: origin, destinationAddress: destination, distanceKm: distance === '' ? null : Number(distance) });
            if (!result.success) { setError(result.error); return; }
            setNotice('Jarak disimpan. Rencana perjalanan yang sudah tersimpan tidak berubah.');
            setOrigin(''); setDestination(''); setDistance('');
            await load();
        } catch { setError('Gagal menyimpan jarak. Silakan coba lagi.'); }
        finally { setLoading(false); }
    }
    return (
        <section className="rounded-lg border bg-card p-4 space-y-4" aria-label="Master jarak jalan">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="font-semibold">Jarak rute mobil pabrik</h2>
                    <p className="text-sm text-muted-foreground">Patokan jarak jalan satu arah, terpisah dari tarif dan tagihan customer.</p>
                </div>
                <Button variant="outline" aria-expanded={open} onClick={() => { setOpen(!open); if (!open) void load(); }}> {open ? 'Tutup ruas jalan' : 'Kelola ruas jalan'} </Button>
            </div>
            {open && <>
                <p className="text-sm text-muted-foreground">Gunakan alamat lengkap dan konsisten (termasuk cabang/gudang). Ruas pulang perlu dibuat tersendiri. Menyimpan pasangan alamat yang sama memperbarui jarak master, bukan histori.</p>
                <form onSubmit={save} className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-1"><Label htmlFor="route-origin">Alamat asal</Label><Input id="route-origin" required maxLength={500} value={origin} onChange={(e) => setOrigin(e.target.value)} /></div>
                    <div className="space-y-1"><Label htmlFor="route-destination">Alamat tujuan</Label><Input id="route-destination" required maxLength={500} value={destination} onChange={(e) => setDestination(e.target.value)} /></div>
                    <div className="space-y-1"><Label htmlFor="route-km">Jarak jalan satu arah (km)</Label><Input id="route-km" required type="number" min="0.01" max="99999999.99" step="0.01" value={distance} onChange={(e) => setDistance(e.target.value)} /></div>
                    <div><Button type="submit" disabled={loading}>{loading ? 'Memproses…' : 'Simpan ruas jalan'}</Button></div>
                </form>
                {error && <div role="alert" className="text-sm text-destructive">{error} <Button variant="ghost" onClick={() => void load()} disabled={loading}>Muat ulang</Button></div>}
                {notice && <p role="status" className="text-sm">{notice}</p>}
                {loading ? <p role="status">Memuat…</p> : routes.length === 0 ? <p className="text-sm text-muted-foreground">Belum ada patokan jarak jalan.</p> : <ul className="divide-y">
                    {routes.map((r) => <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                        <span className="min-w-0 break-words">{r.originAddress} → {r.destinationAddress}</span>
                        <span className="flex items-center gap-3"><strong>{r.distanceKm.toLocaleString('id-ID')} km</strong><Button variant="outline" size="sm" onClick={() => { setOrigin(r.originAddress); setDestination(r.destinationAddress); setDistance(String(r.distanceKm)); setNotice(''); }}>Edit</Button></span>
                    </li>)}
                </ul>}
            </>}
        </section>
    );
}
