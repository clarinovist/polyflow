import Link from 'next/link';
import {
    AlertTriangle,
    CheckCircle2,
    ChevronLeft,
    Clock3,
    Package,
    UserRound,
} from 'lucide-react';
import { getMaintenanceDetail } from '@/actions/production/maintenance';
import {
    formatMaintenanceDate,
    MaintenanceStatusBadge,
    MaintenanceUrgencyBadge,
} from '@/components/production/maintenance-badges';
import { MobileReadError } from '@/components/mobile/MobileReadError';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MaintenanceActions } from './actions';
import { canUseMobilePortalCapability } from '@/lib/mobile/mobile-portal-access';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Detail Maintenance Mobile | PolyFlow' };

export default async function MobileMaintenanceDetailPage({
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
    const canDecideOnMobile = await canUseMobilePortalCapability(
        'production-supervisor',
        'feature:mobile-maintenance-approval',
    );
    const viewer = {
        ...order.viewer,
        canApprove: order.viewer.canApprove && canDecideOnMobile,
        canReject: order.viewer.canReject && canDecideOnMobile,
    };

    return (
        <div className="space-y-4">
            <Link
                href="/production/mobile/maintenance"
                className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-muted-foreground"
            >
                <ChevronLeft className="h-4 w-4" /> Antrean maintenance
            </Link>

            <section className="rounded-2xl border bg-card p-4 shadow-sm">
                <p className="font-mono text-xs text-muted-foreground">
                    {order.orderNumber}
                </p>
                <h1 className="mt-1 text-xl font-bold">
                    {order.machine.code} · {order.machine.name}
                </h1>
                <div className="mt-3 flex flex-wrap gap-2">
                    <MaintenanceStatusBadge status={order.status} />
                    <MaintenanceUrgencyBadge urgency={order.urgency} />
                </div>
                <p className="mt-4 whitespace-pre-wrap text-sm leading-6">
                    {order.complaint}
                </p>
            </section>

            {order.machineStopped && (
                <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-200">
                    <AlertTriangle className="h-5 w-5 shrink-0" />
                    <div>
                        <p className="font-semibold">Mesin berhenti</p>
                        <p className="mt-1 text-sm">
                            Prioritaskan pekerjaan ini agar operasi dapat
                            dilanjutkan.
                        </p>
                    </div>
                </div>
            )}

            <Card className="gap-4 py-4">
                <CardHeader className="px-4">
                    <CardTitle className="text-base">
                        Informasi pekerjaan
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 px-4 text-sm">
                    <div className="flex items-start gap-3">
                        <UserRound className="mt-0.5 h-4 w-4 text-muted-foreground" />
                        <div>
                            <p className="text-xs text-muted-foreground">
                                Pelapor
                            </p>
                            <p className="font-medium">
                                {order.createdBy?.name || 'Pengguna'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-start gap-3">
                        <UserRound className="mt-0.5 h-4 w-4 text-muted-foreground" />
                        <div>
                            <p className="text-xs text-muted-foreground">
                                Teknisi
                            </p>
                            <p className="font-medium">
                                {order.assignee?.name ||
                                    order.assigneeName ||
                                    'Belum ditentukan'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-start gap-3">
                        <Clock3 className="mt-0.5 h-4 w-4 text-muted-foreground" />
                        <div>
                            <p className="text-xs text-muted-foreground">
                                Dilaporkan
                            </p>
                            <p className="font-medium">
                                {formatMaintenanceDate(order.createdAt)}
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {order.spareParts.length > 0 && (
                <Card className="gap-4 py-4">
                    <CardHeader className="px-4">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Package className="h-4 w-4" /> Spare part
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 px-4">
                        {order.spareParts.map((part) => (
                            <div
                                key={part.id}
                                className="rounded-lg border p-3 text-sm"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="font-medium">
                                            {part.name}
                                        </p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {part.spec || 'Tanpa spesifikasi'} ·
                                            Qty {String(part.quantity)}
                                        </p>
                                    </div>
                                    <span className="text-xs font-medium">
                                        {part.fulfilled ? 'Terpasang' : 'Belum'}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}

            {order.rejectionReason && (
                <Card className="gap-3 border-red-200 py-4 dark:border-red-800/60">
                    <CardHeader className="px-4">
                        <CardTitle className="text-base text-red-800 dark:text-red-300">
                            Alasan penolakan
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 text-sm">
                        {order.rejectionReason}
                    </CardContent>
                </Card>
            )}

            {order.completionNote && (
                <Card className="gap-3 border-emerald-200 py-4 dark:border-emerald-800/60">
                    <CardHeader className="px-4">
                        <CardTitle className="flex items-center gap-2 text-base text-emerald-800 dark:text-emerald-300">
                            <CheckCircle2 className="h-4 w-4" /> Hasil perbaikan
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 text-sm">
                        {order.completionNote}
                    </CardContent>
                </Card>
            )}

            <MaintenanceActions
                id={order.id}
                status={order.status}
                viewer={viewer}
                technicians={order.technicians}
                spareParts={order.spareParts}
            />
        </div>
    );
}
