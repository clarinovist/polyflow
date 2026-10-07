import Link from 'next/link';
import {
    Activity,
    AlertTriangle,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Clock3,
    Plus,
    Search,
    ShieldCheck,
} from 'lucide-react';
import {
    getMaintenanceRequests,
    type MaintenanceQueue,
} from '@/actions/production/maintenance';
import { MobileReadError } from '@/components/mobile/MobileReadError';
import {
    formatMaintenanceAge,
    formatMaintenanceDate,
    MaintenanceStatusBadge,
    MaintenanceUrgencyBadge,
} from '@/components/production/maintenance-badges';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils/utils';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Maintenance | PolyFlow' };

type SearchParams = {
    queue?: string;
    status?: string;
    urgency?: string;
    stopped?: string;
    q?: string;
    page?: string;
};

const QUEUES: Array<{ value: MaintenanceQueue; label: string }> = [
    { value: 'ACTION', label: 'Perlu tindakan' },
    { value: 'ACTIVE', label: 'Berjalan' },
    { value: 'CLOSED', label: 'Riwayat' },
    { value: 'ALL', label: 'Semua' },
];

export default async function MaintenancePage({
    searchParams,
}: {
    searchParams: Promise<SearchParams>;
}) {
    const params = await searchParams;
    const queue = QUEUES.some((item) => item.value === params.queue)
        ? (params.queue as MaintenanceQueue)
        : 'ACTIVE';
    const parsedPage = Number.parseInt(params.page || '1', 10);
    const page =
        Number.isFinite(parsedPage) && parsedPage > 0
            ? Math.min(parsedPage, 10_000)
            : 1;
    const result = await getMaintenanceRequests({
        queue,
        status: params.status,
        urgency: params.urgency,
        machineStopped: params.stopped === '1' || undefined,
        q: params.q,
        page,
    });
    if (!result.success) {
        return <MobileReadError title="Daftar maintenance belum tersedia" />;
    }
    const { rows, stats, total, totalPages } = result.data;
    const currentPage = result.data.page;
    const query = params.q?.trim() || '';
    const hasFilters = Boolean(
        query ||
            params.status ||
            params.urgency ||
            params.stopped ||
            queue !== 'ACTIVE',
    );

    const buildHref = (overrides: Partial<SearchParams>) => {
        const next = { ...params, ...overrides };
        const search = new URLSearchParams();
        for (const [key, value] of Object.entries(next)) {
            if (!value) continue;
            if (key === 'queue' && value === 'ACTIVE') continue;
            if (key === 'page' && value === '1') continue;
            search.set(key, value);
        }
        const queryString = search.toString();
        return '/production/maintenance' +
            (queryString ? '?' + queryString : '');
    };

    const metrics = [
        {
            label: 'Menunggu persetujuan',
            value: stats.pending,
            description: 'Perlu keputusan hari ini',
            icon: ShieldCheck,
            href: buildHref({
                queue: 'ACTION',
                status: 'PENDING',
                urgency: undefined,
                stopped: undefined,
                q: undefined,
                page: undefined,
            }),
            tone: 'amber',
        },
        {
            label: 'Siap dikerjakan',
            value: stats.approved,
            description: 'Sudah ada teknisi',
            icon: Clock3,
            href: buildHref({
                queue: 'ACTION',
                status: 'APPROVED',
                urgency: undefined,
                stopped: undefined,
                q: undefined,
                page: undefined,
            }),
            tone: 'blue',
        },
        {
            label: 'Sedang dikerjakan',
            value: stats.inProgress,
            description: 'Pekerjaan aktif',
            icon: Activity,
            href: buildHref({
                queue: 'ACTIVE',
                status: 'IN_PROGRESS',
                urgency: undefined,
                stopped: undefined,
                q: undefined,
                page: undefined,
            }),
            tone: 'indigo',
        },
        {
            label: 'Mesin berhenti',
            value: stats.machineStopped,
            description: 'Prioritas laporan terbuka',
            icon: AlertTriangle,
            href: buildHref({
                queue: 'ACTIVE',
                status: undefined,
                urgency: undefined,
                stopped: '1',
                q: undefined,
                page: undefined,
            }),
            tone: 'red',
        },
    ] as const;

    return (
        <div className="mx-auto max-w-[1600px] space-y-6 py-2">
            <header className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Produksi / Maintenance
                    </p>
                    <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">
                        Pusat Maintenance
                    </h1>
                    <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                        Prioritaskan gangguan mesin, tugaskan teknisi, dan pantau pekerjaan sampai selesai.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" className="min-h-11">
                        <Link href="/production/maintenance/stock">
                            Stok spare part
                        </Link>
                    </Button>
                    <Button
                        asChild
                        className="min-h-11 bg-emerald-700 hover:bg-emerald-800"
                    >
                        <Link href="/production/mobile/maintenance/new">
                            <Plus className="h-4 w-4" />
                            Lapor kerusakan
                        </Link>
                    </Button>
                </div>
            </header>

            <section aria-label="Ringkasan maintenance" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                {metrics.map((metric) => (
                    <Link
                        key={metric.label}
                        href={metric.href}
                        className="rounded-xl border bg-card p-4 shadow-sm transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring"
                    >
                        <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium">{metric.label}</p>
                            <metric.icon
                                className={cn(
                                    'h-4 w-4',
                                    metric.tone === 'amber' && 'text-amber-600',
                                    metric.tone === 'blue' && 'text-blue-600',
                                    metric.tone === 'indigo' && 'text-indigo-600',
                                    metric.tone === 'red' && 'text-red-600',
                                )}
                            />
                        </div>
                        <p className="mt-2 text-2xl font-semibold tabular-nums">
                            {metric.value}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            {metric.description}
                        </p>
                    </Link>
                ))}
            </section>

            <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
                <div className="border-b p-4">
                    <nav aria-label="Filter antrean maintenance" className="flex gap-2 overflow-x-auto pb-1">
                        {QUEUES.map((item) => {
                            const active = queue === item.value && !params.status;
                            return (
                                <Button
                                    key={item.value}
                                    asChild
                                    size="sm"
                                    variant={active ? 'default' : 'outline'}
                                    className={cn(
                                        'min-h-10 shrink-0',
                                        active && 'bg-emerald-700 hover:bg-emerald-800',
                                    )}
                                >
                                    <Link
                                        href={buildHref({
                                            queue: item.value,
                                            status: undefined,
                                            urgency: undefined,
                                            stopped: undefined,
                                            q: undefined,
                                            page: undefined,
                                        })}
                                        aria-current={active ? 'page' : undefined}
                                    >
                                        {item.label}
                                    </Link>
                                </Button>
                            );
                        })}
                    </nav>

                    <form className="mt-4 grid gap-3 md:grid-cols-[minmax(260px,1fr)_220px_220px_auto]">
                        {queue !== 'ACTIVE' && (
                            <input type="hidden" name="queue" value={queue} />
                        )}
                        {params.stopped === '1' && (
                            <input type="hidden" name="stopped" value="1" />
                        )}
                        <label className="relative">
                            <span className="sr-only">Cari maintenance</span>
                            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input
                                name="q"
                                defaultValue={query}
                                placeholder="Cari nomor, mesin, keluhan, teknisi..."
                                className="min-h-11 pl-9"
                            />
                        </label>
                        <label>
                            <span className="sr-only">Status</span>
                            <select
                                name="status"
                                defaultValue={params.status || ''}
                                className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                            >
                                <option value="">Semua status antrean</option>
                                <option value="DRAFT">Draft saya</option>
                                <option value="PENDING">Menunggu persetujuan</option>
                                <option value="APPROVED">Siap dikerjakan</option>
                                <option value="IN_PROGRESS">Sedang dikerjakan</option>
                                <option value="DONE">Selesai</option>
                                <option value="REJECTED">Ditolak</option>
                                <option value="CANCELLED">Dibatalkan</option>
                            </select>
                        </label>
                        <label>
                            <span className="sr-only">Urgensi</span>
                            <select
                                name="urgency"
                                defaultValue={params.urgency || ''}
                                className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                            >
                                <option value="">Semua urgensi</option>
                                <option value="URGENT">Mendesak</option>
                                <option value="NORMAL">Normal</option>
                                <option value="LOW">Rendah</option>
                            </select>
                        </label>
                        <Button type="submit" variant="outline" className="min-h-11">
                            Terapkan
                        </Button>
                    </form>
                </div>

                <div className="border-b px-4 py-3 text-sm text-muted-foreground">
                    {total} laporan ditemukan
                </div>

                {rows.length === 0 ? (
                    <div className="flex flex-col items-center px-6 py-16 text-center">
                        <div className="rounded-full bg-emerald-50 p-3 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                            <CheckCircle2 className="h-6 w-6" />
                        </div>
                        <h2 className="mt-4 font-semibold">
                            {hasFilters
                                ? 'Tidak ada laporan yang cocok'
                                : 'Tidak ada pekerjaan maintenance aktif'}
                        </h2>
                        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                            {hasFilters
                                ? 'Ubah kata kunci atau hapus filter untuk melihat laporan lain.'
                                : 'Gangguan mesin baru akan muncul di antrean ini.'}
                        </p>
                        {hasFilters && (
                            <Button asChild variant="outline" className="mt-4">
                                <Link href="/production/maintenance">Hapus filter</Link>
                            </Button>
                        )}
                    </div>
                ) : (
                    <>
                        <div className="space-y-3 p-4 md:hidden">
                            {rows.map((row) => (
                                <Link
                                    key={row.id}
                                    href={'/production/maintenance/' + row.id}
                                    className={cn(
                                        'block rounded-xl border bg-background p-4 focus-visible:outline-2 focus-visible:outline-ring',
                                        row.machineStopped && 'border-red-300 dark:border-red-800',
                                    )}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="font-mono text-xs text-muted-foreground">
                                                {row.orderNumber}
                                            </p>
                                            <h2 className="mt-1 font-semibold">
                                                {row.machine.code} · {row.machine.name}
                                            </h2>
                                        </div>
                                        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                                    </div>
                                    <p className="mt-3 line-clamp-2 text-sm">
                                        {row.complaint}
                                    </p>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        <MaintenanceStatusBadge status={row.status} />
                                        <MaintenanceUrgencyBadge urgency={row.urgency} />
                                        {row.machineStopped && (
                                            <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 dark:text-red-300">
                                                <AlertTriangle className="h-3.5 w-3.5" /> Mesin berhenti
                                            </span>
                                        )}
                                    </div>
                                    <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                                        <span>{row.assigneeName || 'Teknisi belum ditentukan'}</span>
                                        <span>{formatMaintenanceAge(row.createdAt)}</span>
                                    </div>
                                </Link>
                            ))}
                        </div>

                        <div className="hidden md:block">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/40">
                                        <TableHead className="pl-5">Mesin & keluhan</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Teknisi</TableHead>
                                        <TableHead>Dibuat</TableHead>
                                        <TableHead className="pr-5">
                                            <span className="sr-only">Detail</span>
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {rows.map((row) => (
                                        <TableRow key={row.id}>
                                            <TableCell className="max-w-xl py-4 pl-5 whitespace-normal">
                                                <Link
                                                    href={'/production/maintenance/' + row.id}
                                                    className="font-semibold underline-offset-4 hover:underline"
                                                >
                                                    {row.machine.code} · {row.machine.name}
                                                </Link>
                                                <p className="mt-1 font-mono text-xs text-muted-foreground">
                                                    {row.orderNumber}
                                                </p>
                                                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                                                    {row.complaint}
                                                </p>
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    <MaintenanceUrgencyBadge urgency={row.urgency} />
                                                    {row.machineStopped && (
                                                        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 dark:text-red-300">
                                                            <AlertTriangle className="h-3.5 w-3.5" /> Mesin berhenti
                                                        </span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="align-top py-4">
                                                <MaintenanceStatusBadge status={row.status} />
                                            </TableCell>
                                            <TableCell className="align-top py-4">
                                                {row.assigneeName || 'Belum ditentukan'}
                                            </TableCell>
                                            <TableCell className="align-top py-4">
                                                <p>{formatMaintenanceAge(row.createdAt)} lalu</p>
                                                <p className="mt-1 text-xs text-muted-foreground">
                                                    {formatMaintenanceDate(row.createdAt)}
                                                </p>
                                            </TableCell>
                                            <TableCell className="pr-5 align-top py-4">
                                                <Button asChild variant="ghost" size="icon" className="min-h-11 min-w-11">
                                                    <Link
                                                        href={'/production/maintenance/' + row.id}
                                                        aria-label={'Buka ' + row.orderNumber}
                                                    >
                                                        <ChevronRight className="h-4 w-4" />
                                                    </Link>
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </>
                )}

                {totalPages > 1 && (
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4 text-sm">
                        <p className="text-muted-foreground">
                            Halaman {currentPage} dari {totalPages}
                        </p>
                        <div className="flex gap-2">
                            {currentPage <= 1 ? (
                                <Button variant="outline" disabled>
                                    <ChevronLeft className="h-4 w-4" /> Sebelumnya
                                </Button>
                            ) : (
                                <Button asChild variant="outline">
                                    <Link
                                        href={buildHref({
                                            page: String(currentPage - 1),
                                        })}
                                    >
                                        <ChevronLeft className="h-4 w-4" /> Sebelumnya
                                    </Link>
                                </Button>
                            )}
                            {currentPage >= totalPages ? (
                                <Button variant="outline" disabled>
                                    Berikutnya <ChevronRight className="h-4 w-4" />
                                </Button>
                            ) : (
                                <Button asChild variant="outline">
                                    <Link
                                        href={buildHref({
                                            page: String(currentPage + 1),
                                        })}
                                    >
                                        Berikutnya <ChevronRight className="h-4 w-4" />
                                    </Link>
                                </Button>
                            )}
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
}
