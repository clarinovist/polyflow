import Link from 'next/link';
import {
    AlertTriangle,
    CheckCircle2,
    CircleDot,
    Clock3,
    UserRound,
    Wrench,
} from 'lucide-react';
import { getMaintenanceDetail } from '@/actions/production/maintenance';
import { MobileReadError } from '@/components/mobile/MobileReadError';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { EntityStatusTimeline } from '@/components/shared/EntityStatusTimeline';
import {
    formatMaintenanceDate,
    MaintenanceStatusBadge,
    MaintenanceUrgencyBadge,
} from '@/components/production/maintenance-badges';
import { MaintenanceActions } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Detail Maintenance | PolyFlow' };

const STEPS = [
    { key: 'PENDING', label: 'Dilaporkan' },
    { key: 'APPROVED', label: 'Disetujui' },
    { key: 'IN_PROGRESS', label: 'Dikerjakan' },
    { key: 'DONE', label: 'Selesai' },
] as const;
const STATUS_STEP: Record<string, number> = {
    DRAFT: 0,
    PENDING: 1,
    APPROVED: 2,
    IN_PROGRESS: 3,
    DONE: 4,
};

function MaintenanceProgress({ status }: { status: string }) {
    const current = STATUS_STEP[status] ?? 0;
    const terminal = status === 'REJECTED' || status === 'CANCELLED';
    return (
        <section
            aria-label="Progres maintenance"
            className="overflow-hidden rounded-xl border bg-card p-4 shadow-sm"
        >
            {terminal && (
                <p className="mb-3 text-sm text-muted-foreground">
                    Alur dihentikan sebelum pekerjaan selesai.
                </p>
            )}
            <ol className="grid grid-cols-4 gap-2">
                {STEPS.map((step, index) => {
                    const complete = !terminal && current > index;
                    const active = !terminal && current === index + 1;
                    return (
                        <li key={step.key} className="min-w-0 text-center">
                            <div className="flex items-center">
                                <div
                                    className={
                                        'h-1 flex-1 rounded-full ' +
                                        (index === 0 || complete || active
                                            ? 'bg-emerald-600'
                                            : 'bg-muted')
                                    }
                                />
                                <div
                                    className={
                                        'mx-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs ' +
                                        (complete
                                            ? 'border-emerald-600 bg-emerald-600 text-white'
                                            : active
                                              ? 'border-emerald-600 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                              : 'border-border bg-background text-muted-foreground')
                                    }
                                >
                                    {complete ? (
                                        <CheckCircle2 className="h-4 w-4" />
                                    ) : (
                                        index + 1
                                    )}
                                </div>
                                <div
                                    className={
                                        'h-1 flex-1 rounded-full ' +
                                        (complete ? 'bg-emerald-600' : 'bg-muted')
                                    }
                                />
                            </div>
                            <span
                                className={
                                    'mt-2 block truncate text-[11px] font-medium sm:text-xs ' +
                                    (active || complete
                                        ? 'text-foreground'
                                        : 'text-muted-foreground')
                                }
                            >
                                {step.label}
                            </span>
                        </li>
                    );
                })}
            </ol>
        </section>
    );
}

export default async function MaintenanceDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const result = await getMaintenanceDetail(id);
    if (!result.success) {
        return <MobileReadError title="Detail maintenance belum tersedia" />;
    }
    const order = result.data;

    return (
        <div className="mx-auto max-w-[1200px] space-y-6 py-2">
            <header className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <Button asChild variant="link" className="h-auto p-0 text-muted-foreground">
                        <Link href="/production/maintenance">
                            ← Kembali ke Maintenance
                        </Link>
                    </Button>
                    <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Produksi / Maintenance / {order.orderNumber}
                    </p>
                    <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">
                        {order.machine.code} · {order.machine.name}
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        {order.orderNumber} · Dilaporkan {formatMaintenanceDate(order.createdAt)}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <MaintenanceUrgencyBadge urgency={order.urgency} />
                    <MaintenanceStatusBadge status={order.status} />
                </div>
            </header>

            {order.machineStopped && (
                <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-200">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                    <div>
                        <p className="font-semibold">Mesin berhenti</p>
                        <p className="mt-1 text-sm">
                            Laporan ini menghentikan operasi mesin dan perlu diprioritaskan.
                        </p>
                    </div>
                </div>
            )}

            <MaintenanceProgress status={order.status} />

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="min-w-0 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Wrench className="h-4 w-4 text-emerald-700" />
                                Detail kerusakan
                            </CardTitle>
                            <CardDescription>
                                Gejala dan konteks awal dari pelapor.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-5">
                            <p className="whitespace-pre-wrap text-sm leading-6">
                                {order.complaint}
                            </p>
                            <dl className="grid gap-4 border-t pt-4 text-sm sm:grid-cols-2">
                                <div>
                                    <dt className="flex items-center gap-1.5 text-muted-foreground">
                                        <UserRound className="h-4 w-4" /> Pelapor
                                    </dt>
                                    <dd className="mt-1 font-medium">
                                        {order.createdBy?.name || 'Pengguna'}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="flex items-center gap-1.5 text-muted-foreground">
                                        <UserRound className="h-4 w-4" /> Teknisi
                                    </dt>
                                    <dd className="mt-1 font-medium">
                                        {order.assignee?.name || order.assigneeName || 'Belum ditentukan'}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="flex items-center gap-1.5 text-muted-foreground">
                                        <Clock3 className="h-4 w-4" /> Disetujui
                                    </dt>
                                    <dd className="mt-1 font-medium">
                                        {order.approvedAt
                                            ? formatMaintenanceDate(order.approvedAt)
                                            : 'Belum disetujui'}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="flex items-center gap-1.5 text-muted-foreground">
                                        <CheckCircle2 className="h-4 w-4" /> Selesai
                                    </dt>
                                    <dd className="mt-1 font-medium">
                                        {order.completedAt
                                            ? formatMaintenanceDate(order.completedAt)
                                            : 'Belum selesai'}
                                    </dd>
                                </div>
                            </dl>
                        </CardContent>
                    </Card>

                    {order.rejectionReason && (
                        <Card className="border-red-200 dark:border-red-800/60">
                            <CardHeader>
                                <CardTitle className="text-base text-red-800 dark:text-red-300">
                                    Alasan penolakan
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="whitespace-pre-wrap text-sm">
                                    {order.rejectionReason}
                                </p>
                            </CardContent>
                        </Card>
                    )}

                    {order.completionNote && (
                        <Card className="border-emerald-200 dark:border-emerald-800/60">
                            <CardHeader>
                                <CardTitle className="text-base text-emerald-800 dark:text-emerald-300">
                                    Hasil perbaikan
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="whitespace-pre-wrap text-sm">
                                    {order.completionNote}
                                </p>
                            </CardContent>
                        </Card>
                    )}

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">
                                Kebutuhan spare part
                            </CardTitle>
                            <CardDescription>
                                Part terhubung stok akan dipotong ketika ditandai terpasang saat penyelesaian.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {order.spareParts.length ? (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Spare part</TableHead>
                                            <TableHead>Spesifikasi</TableHead>
                                            <TableHead className="text-right">Qty</TableHead>
                                            <TableHead>Status</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {order.spareParts.map((part) => (
                                            <TableRow key={part.id}>
                                                <TableCell className="font-medium">
                                                    {part.name}
                                                </TableCell>
                                                <TableCell>
                                                    {part.spec || '—'}
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums">
                                                    {String(part.quantity)}
                                                </TableCell>
                                                <TableCell>
                                                    {part.fulfilled
                                                        ? 'Terpasang'
                                                        : 'Belum terpasang'}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            ) : (
                                <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
                                    <CircleDot className="h-4 w-4" />
                                    Tidak ada kebutuhan spare part pada laporan ini.
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <EntityStatusTimeline
                        entityType="MaintenanceRequest"
                        entityId={order.id}
                        title="Riwayat pekerjaan"
                        description="Perubahan status dan pelaksana tercatat untuk audit."
                    />
                </div>

                <div className="lg:sticky lg:top-24 lg:self-start">
                    <MaintenanceActions
                        id={order.id}
                        status={order.status}
                        viewer={order.viewer}
                        technicians={order.technicians}
                        spareParts={order.spareParts}
                    />
                </div>
            </div>
        </div>
    );
}
