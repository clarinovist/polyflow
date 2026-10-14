import {
    readHppPriceSimulatorDefault,
    readHppPriceSimulatorVariantOptions,
} from '@/actions/production/hpp-price-simulator-query';
import { Button } from '@/components/ui/button';
import { requireHppPriceSimulatorAccess } from '@/lib/auth/hpp-price-simulator-access';
import { withTenantPage } from '@/lib/core/tenant';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { SimulatorClient } from './SimulatorClient';

export const dynamic = 'force-dynamic';

const loadSimulator = withTenantPage(async () => {
    const { db } = await requireHppPriceSimulatorAccess();
    const options = await readHppPriceSimulatorVariantOptions(db);
    const initialDefault = options[0]
        ? await readHppPriceSimulatorDefault(db, options[0].id)
        : null;
    return { options, initialDefault };
});

export default async function HppPriceSimulatorPage() {
    const data = await loadSimulator();

    return (
        <div className="mx-auto max-w-[1800px] space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        <Link
                            href="/production/costing"
                            className="inline-flex min-h-10 items-center gap-2 rounded-md px-1 hover:text-foreground"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            Analisis Biaya
                        </Link>
                        <span aria-hidden="true">/</span>
                        <span>Simulator</span>
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        Simulator HPP & Harga
                    </h1>
                    <p className="max-w-3xl text-muted-foreground">
                        Uji asumsi material, tenaga kerja, overhead, output, dan
                        margin tanpa mengubah data produksi. Hasil dinyatakan per
                        primary unit output varian.
                    </p>
                </div>
                <Button variant="outline" asChild className="min-h-11">
                    <Link href="/production/costing">
                        Kembali ke costing aktual
                    </Link>
                </Button>
            </div>

            <div className="flex items-start gap-3 rounded-lg border border-emerald-200/70 bg-emerald-50/50 p-4 text-sm dark:border-emerald-900 dark:bg-emerald-950/20">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-400" />
                <div>
                    <p className="font-semibold">Simulasi read-only</p>
                    <p className="text-muted-foreground">
                        Tidak ada tombol terapkan dan tidak ada data yang
                        disimpan. Sumber biaya: rata-rata persediaan INTERNAL
                        valid → biaya standar → harga beli → belum tersedia.
                    </p>
                </div>
            </div>

            <SimulatorClient
                options={data.options}
                initialDefault={data.initialDefault}
            />
        </div>
    );
}
