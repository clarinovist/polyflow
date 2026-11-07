'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import type { ServiceItemView, VehicleServiceView } from '@/services/sales/vehicle-service-service';
import { formatFleetKm } from '@/lib/sales/fleet-summary';
import { ServiceItemCard } from './ServiceItemCard';
import { ServiceItemDialog, type ServiceItemTarget } from './ServiceItemDialog';
import {
    ServiceCorrectionDialog, ServiceRecordDialog, type RecordTarget, type ServiceCorrectionTarget,
} from './ServiceRecordDialogs';

function Notice({ view }: { view: VehicleServiceView }) {
    if (view.ownershipType !== 'FACTORY') return <p className="text-sm text-muted-foreground">Pengingat servis hanya tersedia untuk mobil pabrik.</p>;
    if (view.vehicleStatus !== 'ACTIVE') return <p className="text-sm text-muted-foreground">Jenis servis baru hanya bisa ditambahkan saat kendaraan berstatus aktif.</p>;
    return null;
}

export function VehicleServicePanel({ view }: { view: VehicleServiceView }) {
    const router = useRouter();
    const [itemTarget, setItemTarget] = useState<ServiceItemTarget | null>(null);
    const [recordTarget, setRecordTarget] = useState<RecordTarget | null>(null);
    const [correction, setCorrection] = useState<ServiceCorrectionTarget | null>(null);
    const isFactory = view.ownershipType === 'FACTORY';
    const canAdd = isFactory && view.vehicleStatus === 'ACTIVE';
    const refresh = () => router.refresh();
    const record = (item: ServiceItemView) => setRecordTarget({ vehicleId: view.vehicleId, itemId: item.id, label: item.label, suggestedKm: item.suggestedKm });
    return <section className="rounded-lg border bg-card p-4 md:p-6 space-y-4" aria-label="Servis kendaraan">
        <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
                <h2 className="text-lg font-semibold">Servis</h2>
                <p className="text-sm text-muted-foreground">Pengingat dihitung dari servis terakhir, interval per truk, dan KM terakhir di buku KM (saat ini {formatFleetKm(view.latestMileageKm)}). Biaya servis dicatat di Keuangan.</p>
            </div>
            {canAdd && <Button type="button" className="min-h-11" onClick={() => setItemTarget({ mode: 'create', vehicleId: view.vehicleId })}>Tambah jenis servis</Button>}
        </div>
        <Notice view={view} />
        {isFactory && (view.items.length === 0
            ? <p className="text-sm text-muted-foreground">Belum ada jenis servis. Tambahkan jenis servis (mis. oli mesin) beserta intervalnya, lalu catat servis terakhir sebagai titik awal.</p>
            : <ul className="space-y-3">
                {view.items.map((item) => <ServiceItemCard key={item.id} item={item} onRecord={record}
                    onEdit={(target) => setItemTarget({ mode: 'edit', item: target })}
                    onCorrect={(target, entry) => setCorrection({ recordId: entry.id, label: target.label, servicedAt: entry.servicedAt, odometerKm: entry.odometerKm, note: entry.note })} />)}
            </ul>)}
        <ServiceItemDialog target={itemTarget} onClose={() => setItemTarget(null)} onSaved={refresh} />
        <ServiceRecordDialog target={recordTarget} onClose={() => setRecordTarget(null)} onSaved={refresh} />
        <ServiceCorrectionDialog target={correction} onClose={() => setCorrection(null)} onSaved={refresh} />
    </section>;
}
