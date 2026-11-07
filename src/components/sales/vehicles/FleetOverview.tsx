'use client';

import { useEffect, useState } from 'react';
import { getFleetOverview } from '@/actions/sales/fleet-summary';
import type { FleetSummary } from '@/services/sales/fleet-summary-service';
import type { FleetServiceAlert } from '@/services/sales/vehicle-service-service';
import { fleetMonth } from '@/lib/sales/fleet-summary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { VehicleTable, type VehicleRow } from './VehicleTable';

interface FleetOverviewProps { vehicles: VehicleRow[]; /** null when the alert read failed. */ serviceAlerts?: FleetServiceAlert[] | null }

function ServiceSummary({ alerts }: { alerts: FleetServiceAlert[] | null }) {
    if (alerts === null) return <p aria-label="Ringkasan servis" className="rounded-lg border p-3 text-sm">Pengingat servis belum dapat dimuat. Muat ulang halaman untuk mencoba lagi.</p>;
    if (!alerts.length) return <p aria-label="Ringkasan servis" className="rounded-lg border p-3 text-sm text-muted-foreground">Tidak ada truk pabrik yang mendekati atau melewati jadwal servis.</p>;
    return <div aria-label="Ringkasan servis" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
        <p className="font-medium">{alerts.length} truk perlu servis</p>
        <p className="break-words">{alerts.map((alert) => alert.plateNumber).join(', ')}</p>
    </div>;
}

export function FleetOverview({ vehicles, serviceAlerts = [] }: FleetOverviewProps) {
    const [month, setMonth] = useState(fleetMonth);
    const [summaries, setSummaries] = useState<FleetSummary[]>([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [reload, setReload] = useState(0);
    useEffect(() => {
        let current = true;
        async function load() {
            setLoading(true);
            setError('');
            try {
                const result = await getFleetOverview(vehicles.map((v) => v.id), month);
                if (!current) return;
                if (result.success) setSummaries(result.data);
                else { setSummaries([]); setError(result.error); }
            } catch {
                if (current) { setSummaries([]); setError('Gagal memuat ringkasan kilometer.'); }
            } finally { if (current) setLoading(false); }
        }
        void load();
        return () => { current = false; };
    }, [vehicles, month, reload]);
    return <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4 rounded-lg border bg-card p-4">
            <div className="max-w-2xl space-y-1 text-sm text-muted-foreground">
                <p>KM pengiriman per rit, bukan seluruh pemakaian kendaraan. Odometer adalah pembacaan terakhir yang dicatat, bukan posisi real-time.</p>
                <p>Status aktif bukan jaminan tersedia. Pengingat servis hanya untuk mobil pabrik dan bergantung pada interval yang diisi admin per truk; KIR mengikuti tanggal dokumen.</p>
            </div>
            <div className="space-y-1"><Label htmlFor="fleet-month">Bulan keberangkatan (WIB)</Label><Input id="fleet-month" type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></div>
        </div>
        <ServiceSummary alerts={serviceAlerts} />
        {loading && <p role="status" className="text-sm">Memuat ringkasan kilometer…</p>}
        {error && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border p-4 text-sm">{error}<Button variant="outline" onClick={() => setReload((value) => value + 1)}>Coba lagi</Button></div>}
        <VehicleTable vehicles={vehicles} summaries={loading || error ? [] : summaries} serviceAlerts={serviceAlerts ?? []} />
    </div>;
}
