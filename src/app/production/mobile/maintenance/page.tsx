import Link from 'next/link';
import {
    AlertTriangle,
    CheckCircle2,
    ChevronRight,
    Clock3,
    History,
    Plus,
    Wrench,
} from 'lucide-react';
import { getMaintenanceRequests } from '@/actions/production/maintenance';
import {
    formatMaintenanceAge,
    MaintenanceStatusBadge,
    MaintenanceUrgencyBadge,
} from '@/components/production/maintenance-badges';
import { MobileEmptyState, MobileSectionHeader } from '@/components/mobile';
import { MobileReadError } from '@/components/mobile/MobileReadError';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Maintenance Mobile | PolyFlow' };

export default async function MobileMaintenancePage({
    searchParams,
}: {
    searchParams: Promise<{ view?: string }>;
}) {
    const { view } = await searchParams;
    const closed = view === 'history';
    const result = await getMaintenanceRequests({
        queue: closed ? 'CLOSED' : 'ACTIVE',
        page: 1,
    });
    if (!result.success) {
        return <MobileReadError title="Daftar maintenance belum tersedia" />;
    }
    const { rows, stats, total, totalPages } = result.data;

    return (
        <div className="space-y-5">
            <div className="rounded-2xl border bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                            Produksi
                        </p>
                        <h1 className="mt-1 text-xl font-bold">Maintenance</h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Lapor gangguan dan lanjutkan pekerjaan mesin.
                        </p>
                    </div>
                    <Button
                        asChild
                        size="sm"
                        className="min-h-11 shrink-0 bg-emerald-700 hover:bg-emerald-800"
                    >
                        <Link href="/production/mobile/maintenance/new">
                            <Plus className="h-4 w-4" /> Lapor
                        </Link>
                    </Button>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                    <div className="rounded-lg bg-amber-50 p-3 dark:bg-amber-950/30">
                        <p className="text-xl font-bold tabular-nums text-amber-800 dark:text-amber-300">
                            {stats.pending}
                        </p>
                        <p className="text-[11px] text-amber-700 dark:text-amber-400">
                            Menunggu
                        </p>
                    </div>
                    <div className="rounded-lg bg-blue-50 p-3 dark:bg-blue-950/30">
                        <p className="text-xl font-bold tabular-nums text-blue-800 dark:text-blue-300">
                            {stats.approved}
                        </p>
                        <p className="text-[11px] text-blue-700 dark:text-blue-400">
                            Siap
                        </p>
                    </div>
                    <div className="rounded-lg bg-indigo-50 p-3 dark:bg-indigo-950/30">
                        <p className="text-xl font-bold tabular-nums text-indigo-800 dark:text-indigo-300">
                            {stats.inProgress}
                        </p>
                        <p className="text-[11px] text-indigo-700 dark:text-indigo-400">
                            Dikerjakan
                        </p>
                    </div>
                </div>
            </div>

            <div className="flex gap-2">
                <Button
                    asChild
                    variant={!closed ? 'default' : 'outline'}
                    className={!closed ? 'min-h-11 flex-1 bg-emerald-700 hover:bg-emerald-800' : 'min-h-11 flex-1'}
                >
                    <Link
                        href="/production/mobile/maintenance"
                        aria-current={!closed ? 'page' : undefined}
                    >
                        <Wrench className="h-4 w-4" /> Terbuka
                    </Link>
                </Button>
                <Button
                    asChild
                    variant={closed ? 'default' : 'outline'}
                    className={closed ? 'min-h-11 flex-1 bg-emerald-700 hover:bg-emerald-800' : 'min-h-11 flex-1'}
                >
                    <Link
                        href="/production/mobile/maintenance?view=history"
                        aria-current={closed ? 'page' : undefined}
                    >
                        <History className="h-4 w-4" /> Riwayat
                    </Link>
                </Button>
            </div>

            <MobileSectionHeader
                title={closed ? 'Riwayat pekerjaan' : 'Antrean aktif'}
                level={1}
                className="px-0"
            />

            {rows.length ? (
                <div className="space-y-3">
                    {rows.map((row) => (
                        <Link
                            key={row.id}
                            href={'/production/mobile/maintenance/' + row.id}
                            className={
                                'block rounded-xl border bg-card p-4 shadow-sm transition-transform active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-ring ' +
                                (row.machineStopped
                                    ? 'border-red-300 dark:border-red-800'
                                    : '')
                            }
                        >
                            <div className="flex items-start gap-3">
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-mono text-xs text-muted-foreground">
                                            {row.orderNumber}
                                        </span>
                                        {row.machineStopped && (
                                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 dark:text-red-300">
                                                <AlertTriangle className="h-3.5 w-3.5" /> Berhenti
                                            </span>
                                        )}
                                    </div>
                                    <h2 className="mt-1 font-semibold">
                                        {row.machine.code} · {row.machine.name}
                                    </h2>
                                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                                        {row.complaint}
                                    </p>
                                </div>
                                <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                                <MaintenanceStatusBadge status={row.status} />
                                <MaintenanceUrgencyBadge urgency={row.urgency} />
                            </div>
                            <div className="mt-3 flex items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground">
                                <span className="truncate">
                                    {row.assigneeName || 'Teknisi belum ditentukan'}
                                </span>
                                <span className="inline-flex shrink-0 items-center gap-1">
                                    <Clock3 className="h-3.5 w-3.5" />
                                    {formatMaintenanceAge(row.createdAt)}
                                </span>
                            </div>
                        </Link>
                    ))}
                </div>
            ) : (
                <MobileEmptyState
                    icon={CheckCircle2}
                    title={closed ? 'Belum ada riwayat' : 'Tidak ada laporan terbuka'}
                    description={
                        closed
                            ? 'Laporan selesai, ditolak, atau dibatalkan akan tampil di sini.'
                            : 'Semua mesin aman atau pekerjaan maintenance sudah ditutup.'
                    }
                    action={
                        !closed ? (
                            <Button asChild variant="outline" className="min-h-11">
                                <Link href="/production/mobile/maintenance/new">
                                    Lapor kerusakan
                                </Link>
                            </Button>
                        ) : undefined
                    }
                />
            )}

            {totalPages > 1 && (
                <Button asChild variant="outline" className="min-h-11 w-full">
                    <Link
                        href={
                            '/production/maintenance?' +
                            (closed ? 'queue=CLOSED' : 'queue=ACTIVE')
                        }
                    >
                        Lihat semua {total} laporan
                    </Link>
                </Button>
            )}
        </div>
    );
}
