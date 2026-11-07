import Link from 'next/link';
import { Gauge } from 'lucide-react';
import { getFleetMileageBoard } from '@/actions/sales/vehicle-mileage';
import { MileageBoard } from '@/components/sales/vehicles/MileageBoard';

export default async function VehicleMileagePage() {
    const board = await getFleetMileageBoard();
    return (
        <div className="p-4 md:p-6 space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                    <Gauge className="h-8 w-8 text-muted-foreground" />
                    KM Truk
                </h1>
                <p className="text-muted-foreground">Catat KM berangkat dan kembali per truk pabrik. Tidak harus terhubung ke jadwal pengiriman.</p>
                <Link href="/sales/vehicles" className="text-sm underline underline-offset-4">Kembali ke daftar kendaraan</Link>
            </div>
            {board.success ? <MileageBoard cards={board.data} /> : <div role="alert" className="space-y-2 rounded-lg border p-4">
                <p>Data KM truk gagal dimuat. {board.error}</p>
                {/* Full navigation retries the failed server read, not a cached same-route RSC. */}
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                <a href="/sales/vehicles/km" className="underline">Muat ulang</a>
            </div>}
        </div>
    );
}
