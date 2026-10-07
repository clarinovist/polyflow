import Link from 'next/link';
import { ChevronLeft, Info, Wrench } from 'lucide-react';
import { getMaintenanceFormData } from '@/actions/production/maintenance';
import { MobileReadError } from '@/components/mobile/MobileReadError';
import { MaintenanceForm } from './form-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Lapor Maintenance | PolyFlow' };

export default async function NewMaintenancePage() {
    const result = await getMaintenanceFormData();
    if (!result.success) {
        return <MobileReadError title="Form maintenance belum tersedia" />;
    }
    return (
        <div className="mx-auto max-w-2xl space-y-4">
            <Link
                href="/production/mobile/maintenance"
                className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-muted-foreground"
            >
                <ChevronLeft className="h-4 w-4" /> Antrean maintenance
            </Link>
            <header className="rounded-2xl border bg-card p-4 shadow-sm">
                <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                        <Wrench className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                            Laporan baru
                        </p>
                        <h1 className="mt-1 text-xl font-bold">Lapor kerusakan mesin</h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Isi kondisi utama lebih dulu. Kebutuhan spare part dapat ditambahkan bila sudah diketahui.
                        </p>
                    </div>
                </div>
            </header>
            <div className="flex gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-800/60 dark:bg-blue-950/30 dark:text-blue-200">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                    Setelah dikirim, Kepala Pabrik atau Admin akan memilih teknisi. Anda dapat memantau status dari antrean maintenance.
                </p>
            </div>
            <MaintenanceForm
                machines={result.data.machines}
                spareCatalog={result.data.spareCatalog}
                locations={result.data.locations}
                canManageSpareParts={result.data.canManageSpareParts}
            />
        </div>
    );
}
