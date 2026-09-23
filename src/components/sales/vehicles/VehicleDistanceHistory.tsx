'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getVehicleDistanceHistory } from '@/actions/sales/trip-distance';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TRIP_STATUS_LABELS } from '@/components/sales/schedules/schedule-detail/presentation';

type History = Extract<Awaited<ReturnType<typeof getVehicleDistanceHistory>>, { success: true }>['data'];
const km = (n: number | null) => n === null ? 'Belum diisi' : `${n.toLocaleString('id-ID')} km`;
export function VehicleDistanceHistory({ vehicleId }: { vehicleId: string }) {
    const [month, setMonth] = useState(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7));
    const [history, setHistory] = useState<History | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [reload, setReload] = useState(0);
    useEffect(() => {
        let current = true;
        async function load() {
            setLoading(true); setError('');
            try {
                const result = await getVehicleDistanceHistory(vehicleId, month);
                if (!current) return;
                if (!result.success) { setHistory(null); setError(result.error); }
                else setHistory(result.data);
            } catch { if (current) { setHistory(null); setError('Gagal memuat riwayat kilometer.'); } }
            finally { if (current) setLoading(false); }
        }
        void load();
        return () => { current = false; };
    }, [vehicleId, month, reload]);
    return <section className="rounded-lg border bg-card p-4 md:p-6 space-y-4" aria-label="Riwayat kilometer kendaraan">
        <div className="flex flex-wrap items-end justify-between gap-3">
            <div><h2 className="text-lg font-semibold">Riwayat perjalanan & kilometer</h2><p className="text-sm text-muted-foreground">Per rit, berdasarkan bulan tanggal keberangkatan (WIB). Kilometer rencana tidak masuk total aktual.</p></div>
            <div className="space-y-1"><Label htmlFor="mileage-month">Bulan keberangkatan</Label><Input id="mileage-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></div>
        </div>
        {loading ? <p role="status">Memuat riwayat…</p> : error ? <div role="alert">{error} <Button variant="outline" onClick={() => setReload(reload + 1)}>Coba lagi</Button></div> : history && <>
            <p className="text-sm"><strong>{km(history.actualKm)} aktual tercatat</strong> · {history.recordedTrips} rit lengkap · {history.pendingTrips} rit berangkat/selesai belum lengkap</p>
            {history.rows.length === 0 ? <p className="text-sm text-muted-foreground">Belum ada perjalanan pada bulan ini.</p> : <ul className="divide-y">
                {history.rows.map((row) => <li key={row.id} className="py-4 space-y-2">
                    <div className="flex flex-wrap justify-between gap-2 text-sm"><Link className="font-medium underline" href={`/sales/delivery-schedules/${row.scheduleId}`}>{row.scheduleNumber} · {new Date(row.departureDate).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' })}</Link><span>{TRIP_STATUS_LABELS[row.status] ?? row.status}</span></div>
                    <p className="text-sm break-words">{row.legs.length ? [row.legs[0].originAddress, ...row.legs.map((leg) => leg.destinationAddress)].join(' → ') : row.routeName || 'Rute belum dicatat'}</p>
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm"><span>Rencana: {km(row.plannedDistanceKm)}</span><span>Aktual: <strong>{km(row.actualDistanceKm)}</strong></span><span>Sopir: {row.driverName ?? 'Belum dicatat'}</span></div>
                    {row.odometerStart !== null && <p className="text-xs text-muted-foreground">Odometer {km(row.odometerStart)} → {km(row.odometerEnd)}</p>}
                </li>)}
            </ul>}
        </>}
    </section>;
}
