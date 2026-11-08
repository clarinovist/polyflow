'use client';

import { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { fetchProductInsights } from '@/actions/admin/usage-analytics';
import type { ProductInsightsData } from '@/services/admin/usage-insights.service';
import type {
    FeatureMover,
    ModuleAdoptionStatus,
} from '@/lib/analytics/product-insights';
import { cn } from '@/lib/utils/utils';

interface Props {
    range: 'today' | 'yesterday' | '7d' | '30d';
}

const STATUS_LABEL: Record<ModuleAdoptionStatus, string> = {
    DEAD: 'Mati',
    DECLINING: 'Menurun',
    GROWING: 'Tumbuh',
    STABLE: 'Stabil',
    NO_ENTITLEMENT: 'Tanpa entitlement',
};

const STATUS_CLASS: Record<ModuleAdoptionStatus, string> = {
    DEAD: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
    DECLINING:
        'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    GROWING:
        'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    STABLE: 'bg-muted text-muted-foreground border-border',
    NO_ENTITLEMENT: 'bg-muted text-muted-foreground border-border',
};

function formatChange(changePercent: number): string {
    return changePercent > 0 ? `+${changePercent}%` : `${changePercent}%`;
}

function MoverTable({
    title,
    rows,
}: {
    title: string;
    rows: FeatureMover[];
}) {
    return (
        <div className="rounded-xl bg-card border border-border shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-border text-sm font-semibold">
                {title}
            </div>
            {rows.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                    Belum ada fitur yang memenuhi volume minimum.
                </div>
            ) : (
                <table className="w-full text-xs">
                    <thead className="text-muted-foreground">
                        <tr>
                            <th className="text-left px-5 py-2">Fitur</th>
                            <th className="text-right px-3 py-2">Sekarang</th>
                            <th className="text-right px-3 py-2">Sebelumnya</th>
                            <th className="text-right px-5 py-2">Perubahan</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((f) => (
                            <tr key={f.featureKey} className="border-t border-border">
                                <td className="px-5 py-2" title={f.featureKey}>
                                    {f.label}
                                </td>
                                <td className="px-3 py-2 text-right">{f.current}</td>
                                <td className="px-3 py-2 text-right">{f.previous}</td>
                                <td className="px-5 py-2 text-right font-semibold">
                                    {formatChange(f.changePercent)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}

function ModuleTable({ data }: { data: ProductInsightsData }) {
    return (
        <div className="rounded-xl bg-card border border-border shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-border text-sm font-semibold">
                Adopsi Modul ({data.totalTenants} tenant)
            </div>
            <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                    <tr>
                        <th className="text-left px-5 py-2">Modul</th>
                        <th className="text-right px-3 py-2">Tenant berhak</th>
                        <th className="text-right px-3 py-2">Tenant aktif</th>
                        <th className="text-right px-3 py-2">Views sekarang</th>
                        <th className="text-right px-3 py-2">Views sebelumnya</th>
                        <th className="text-right px-3 py-2">Perubahan</th>
                        <th className="text-left px-5 py-2">Status</th>
                    </tr>
                </thead>
                <tbody>
                    {data.modules.map((m) => (
                        <tr key={m.moduleKey} className="border-t border-border">
                            <td className="px-5 py-2 font-medium">{m.label}</td>
                            <td className="px-3 py-2 text-right">{m.entitledTenants}</td>
                            <td className="px-3 py-2 text-right">{m.activeTenants}</td>
                            <td className="px-3 py-2 text-right">{m.currentViews}</td>
                            <td className="px-3 py-2 text-right">{m.previousViews}</td>
                            <td className="px-3 py-2 text-right">
                                {formatChange(m.changePercent)}
                            </td>
                            <td className="px-5 py-2">
                                <span
                                    className={cn(
                                        'inline-flex px-2 py-0.5 rounded-full border font-semibold',
                                        STATUS_CLASS[m.status],
                                    )}
                                >
                                    {STATUS_LABEL[m.status]}
                                </span>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function UnmappedNotice({ data }: { data: ProductInsightsData }) {
    if (data.unmappedWorkspaces.length === 0) return null;
    return (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs space-y-1">
            <div className="font-semibold">
                Workspace belum terpetakan ke modul entitlement
            </div>
            {data.unmappedWorkspaces.map((w) => (
                <div key={w.workspaceKey}>
                    {w.workspaceKey}: {w.currentViews} views (sebelumnya{' '}
                    {w.previousViews})
                </div>
            ))}
        </div>
    );
}

export function ProductInsightsTab({ range }: Props) {
    const [data, setData] = useState<ProductInsightsData | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    useEffect(() => {
        let isCurrent = true;
        setData(null);
        setErrorMsg(null);
        fetchProductInsights({ range })
            .then((result) => {
                if (isCurrent) setData(result);
            })
            .catch((err: unknown) => {
                if (!isCurrent) return;
                setErrorMsg(
                    err instanceof Error
                        ? err.message
                        : 'Gagal memuat insight produk.',
                );
            });
        return () => {
            isCurrent = false;
        };
    }, [range]);

    if (errorMsg) {
        return (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMsg}</span>
            </div>
        );
    }
    if (!data) {
        return (
            <div className="py-12 text-center text-xs text-muted-foreground">
                Memuat insight produk...
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <p className="text-xs text-muted-foreground">
                Angka adalah jumlah page view, bukan kedalaman pemakaian. Fitur
                yang turun bisa berarti pengguna pindah ke mobile. Periode:{' '}
                {data.periodLabel}.
            </p>
            <ModuleTable data={data} />
            <UnmappedNotice data={data} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <MoverTable title="Fitur Naik" rows={data.risingFeatures} />
                <MoverTable title="Fitur Turun" rows={data.fallingFeatures} />
            </div>
        </div>
    );
}
