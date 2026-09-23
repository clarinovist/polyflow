'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getVehicleDistanceHistory } from '@/actions/sales/trip-distance';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TRIP_STATUS_LABELS } from '@/components/sales/schedules/schedule-detail/presentation';
import { fleetMonth, formatFleetDate, formatFleetKm as km } from '@/lib/sales/fleet-summary';
import { FleetReading } from './FleetReading';

type History = Extract<Awaited<ReturnType<typeof getVehicleDistanceHistory>>, { success: true }>['data'];
export function VehicleDistanceHistory({ vehicleId }: { vehicleId: string }) {
    const [month, setMonth] = useState(fleetMonth);
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
            <div><h2 className="text-lg font-semibold">Perjalanan & pengiriman</h2><p className="text-sm text-muted-foreground">Per rit, berdasarkan bulan tanggal keberangkatan (WIB). Kilometer rencana tidak masuk total aktual.</p></div>
            <div className="space-y-1"><Label htmlFor="mileage-month">Bulan keberangkatan</Label><Input id="mileage-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></div>
        </div>
        {loading ? <p role="status">Memuat riwayat…</p> : error ? <div role="alert">{error} <Button variant="outline" onClick={() => setReload(reload + 1)}>Coba lagi</Button></div> : history && <>
            <div className="rounded-lg bg-muted/40 p-3 space-y-2">
                <FleetReading reading={history.latestReading} />
                <p className="text-xs text-muted-foreground">Pembacaan terakhir dari seluruh riwayat trip, bukan real-time. KM trip tidak mencakup pemakaian di luar pengiriman.</p>
            </div>
            <p className="text-sm"><strong>Aktual periode: {km(history.actualKm)}</strong> · {history.recordedTrips} rit lengkap · {history.pendingTrips} rit belum lengkap</p>
            {history.undatedTrips > 0 && <p className="text-sm text-muted-foreground">{history.undatedTrips} rit tanpa tanggal keberangkatan ditampilkan, tetapi tidak masuk total bulan.</p>}
            <p className="text-xs text-muted-foreground">Status trip, status SJ, dan kendaraan kembali adalah catatan terpisah. Pembatalan tidak menghapus kilometer fisik yang sudah tercatat.</p>
            {history.rows.length === 0 ? <p className="text-sm text-muted-foreground">Belum ada perjalanan pada bulan ini.</p> : <ul className="divide-y">
                {history.rows.map((row) => <li key={row.id} className="py-4 space-y-2">
                    <div className="flex flex-wrap justify-between gap-2 text-sm"><Link className="font-medium underline" href={`/sales/delivery-schedules/${row.scheduleId}`}>{row.scheduleNumber} · {row.departureDate ? new Date(row.departureDate).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' }) : 'Tanggal belum tercatat'}</Link><span>Trip: {TRIP_STATUS_LABELS[row.status] ?? row.status}</span></div>
                    <p className="text-sm break-words">{row.legs.length ? [row.legs[0].originAddress, ...row.legs.map((leg) => leg.destinationAddress)].join(' → ') : row.routeName || 'Rute belum dicatat'}</p>
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm"><span>Rencana: {km(row.plannedDistanceKm)}</span><span>Aktual: <strong>{km(row.actualDistanceKm)}</strong></span><span className="w-full sm:w-auto">Sopir: {row.driverName ?? 'Belum dicatat'}</span></div>
                    {row.odometerStart !== null && <p className="text-xs text-muted-foreground">Odometer {km(row.odometerStart)} → {km(row.odometerEnd)}</p>}
                    <p className="text-xs text-muted-foreground">{row.returnedAt ? `Kembali dicatat ${formatFleetDate(row.returnedAt)} WIB` : 'Kendaraan kembali: belum tercatat'}</p>
                    {row.deliveries.length ? <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm" aria-label="Surat jalan trip">
                        {row.deliveries.map((delivery) => <li key={delivery.id}>
                            <Link className="underline underline-offset-4" href={`/sales/deliveries/${delivery.id}`}>{delivery.orderNumber}</Link>
                            <span className="text-muted-foreground"> · {delivery.status}</span>
                            {delivery.vehicleId !== vehicleId && <span className="block text-xs text-amber-800 dark:text-amber-200">Kendaraan SJ berbeda/belum diisi; KM tetap mengikuti trip.</span>}
                        </li>)}
                    </ul> : <p className="text-xs text-muted-foreground">Belum ada SJ tertaut pada trip ini.</p>}
                </li>)}
            </ul>}
        </>}
    </section>;
}
