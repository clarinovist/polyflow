'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatFleetDate, formatFleetKm } from '@/lib/sales/fleet-summary';
import type { MileageBoardCard } from '@/services/sales/vehicle-mileage-service';
import { MileageFinishForm, MileageStartForm } from './MileageForms';
import { MileageCorrectionDialog, type CorrectionTarget } from './MileageCorrectionDialog';

const STALE_STYLE = 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200';

function lastReading(card: MileageBoardCard): number | null {
    if (!card.latest) return null;
    return card.latest.odometerEnd ?? card.latest.odometerStart;
}
function correctionTarget(card: MileageBoardCard): CorrectionTarget | null {
    if (!card.latest) return null;
    const { id, driverName, odometerStart, odometerEnd } = card.latest;
    return { mileageId: id, label: `${card.plateNumber} · catatan terbaru`, driverName, odometerStart, odometerEnd };
}

function TruckStatus({ card }: { card: MileageBoardCard }) {
    if (!card.isOpen || !card.latest) return <Badge variant="outline">Di pool</Badge>;
    return <div className="space-y-1">
        <Badge variant="outline" className={`whitespace-normal ${card.isStale ? STALE_STYLE : ''}`}>Sedang jalan sejak {formatFleetDate(card.latest.startedAt)} WIB</Badge>
        {card.isStale && <p role="status" className="text-xs text-amber-800 dark:text-amber-200">Sudah lebih dari 1 hari. KM kembali mungkin belum diisi.</p>}
    </div>;
}

function TodayDeliveries({ items }: { items: MileageBoardCard['todayDeliveries'] }) {
    if (!items.length) return <p className="text-xs text-muted-foreground">Tidak ada SJ hari ini.</p>;
    return <div className="space-y-1">
        <p className="text-xs font-medium">SJ hari ini</p>
        <ul className="text-sm space-y-0.5">{items.map((item) => <li key={item.id} className="break-words">{item.orderNumber} · {item.customerName ?? 'Tanpa customer'}</li>)}</ul>
    </div>;
}

function TruckCard({ card, onCorrect, onSaved }: { card: MileageBoardCard; onCorrect: (target: CorrectionTarget) => void; onSaved: () => void }) {
    const target = correctionTarget(card);
    return <section className="rounded-lg border bg-card p-4 space-y-4" aria-label={`KM ${card.plateNumber}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0"><h2 className="text-lg font-semibold break-words">{card.plateNumber}</h2><p className="text-sm text-muted-foreground break-words">{card.name}</p></div>
            <div className="text-right"><p className="text-xs text-muted-foreground">KM terakhir</p><p className="font-medium tabular-nums">{formatFleetKm(lastReading(card))}</p></div>
        </div>
        <TruckStatus card={card} />
        <TodayDeliveries items={card.todayDeliveries} />
        {card.isOpen && card.latest
            ? <MileageFinishForm mileageId={card.latest.id} odometerStart={card.latest.odometerStart} onSaved={onSaved} />
            : <MileageStartForm vehicleId={card.vehicleId} defaultDriver={card.defaultDriver} suggestedKm={card.lastOdometerEnd} onSaved={onSaved} />}
        {target && <Button type="button" variant="outline" className="min-h-11 w-full sm:w-auto" onClick={() => onCorrect(target)}>Koreksi</Button>}
    </section>;
}

export function MileageBoard({ cards }: { cards: MileageBoardCard[] }) {
    const router = useRouter();
    const [target, setTarget] = useState<CorrectionTarget | null>(null);
    if (!cards.length) return <p className="rounded-lg border p-4 text-sm text-muted-foreground">Belum ada mobil pabrik berstatus aktif.</p>;
    return <>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {cards.map((card) => <TruckCard key={card.vehicleId} card={card} onCorrect={setTarget} onSaved={() => router.refresh()} />)}
        </div>
        <MileageCorrectionDialog target={target} onClose={() => setTarget(null)} onSaved={() => router.refresh()} />
    </>;
}
