import { auth } from "@/auth";
import { prisma } from "@/lib/core/prisma";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getAllTenantStats, type TenantStats } from "@/actions/admin/tenant-observability";
import { listTenantBackups } from "@/actions/admin/tenant-backup";
import { listTenantUsers } from "@/actions/admin/tenant-users";
import TenantUsersClient from "./TenantUsersClient";
import { getCrossTenantAuditLogs } from "@/actions/admin/cross-tenant-audit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ArrowLeft, Building2, Users, HardDrive, Clock, Database, ShieldCheck, AlertTriangle } from "lucide-react";
import type { Tenant } from "@prisma/client";

function formatBytes(bytes: number | null): string {
    if (bytes == null) return "—";
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function statusBadge(status: Tenant["status"]) {
    const cls = status === "ACTIVE"
        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
        : status === "SUSPENDED"
        ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
        : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
    return <Badge className={cls}>{status}</Badge>;
}

export default async function TenantDetailPage({ params }: { params: Promise<{ tenantId: string }> }) {
    const session = await auth();
    if (!session?.user || !session.user.isSuperAdmin) {
        redirect("/super-admin");
    }

    const { tenantId } = await params;
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) notFound();

    const [statsMap, backups, auditResult, users] = await Promise.all([
        getAllTenantStats(),
        listTenantBackups(tenant.id),
        getCrossTenantAuditLogs({ page: 1, limit: 25, tenantId: tenant.id }),
        listTenantUsers(tenant.id),
    ]);
    const stats: TenantStats | undefined = statsMap[tenant.id];
    const auditLogs = auditResult.logs;
    const isOnline = stats?.online === true;

    return (
        <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="space-y-2">
                    <Link href="/super-admin" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
                        <ArrowLeft className="h-4 w-4" /> Kembali ke daftar tenant
                    </Link>
                    <div className="flex items-center gap-3">
                        <Building2 className="h-6 w-6 text-muted-foreground" />
                        <h1 className="text-2xl font-bold tracking-tight">{tenant.name}</h1>
                        {statusBadge(tenant.status)}
                    </div>
                    <p className="text-sm text-muted-foreground">
                        <code>{tenant.subdomain}</code> · tenant sejak {format(new Date(tenant.createdAt), "dd MMM yyyy")}
                    </p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <Button asChild variant="outline" size="sm">
                        <a href={`https://${tenant.subdomain}.polyflow.uk`} target="_blank" rel="noreferrer">
                            Buka workspace →
                        </a>
                    </Button>
                </div>
            </div>

            {/* Stats grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                            <Users className="h-4 w-4" /> Users
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {!isOnline ? (
                            <span className="text-xs text-red-600">DB unreachable</span>
                        ) : (
                            <>
                                <div className="text-2xl font-bold">{stats!.activeUserCount}<span className="text-sm text-muted-foreground">/{stats!.userCount}</span></div>
                                <p className="text-xs text-muted-foreground">active / total</p>
                            </>
                        )}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                            <HardDrive className="h-4 w-4" /> DB Size
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {!isOnline ? (
                            <span className="text-xs text-red-600">—</span>
                        ) : (
                            <div className="text-2xl font-bold">{formatBytes(stats!.dbSizeBytes)}</div>
                        )}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                            <Clock className="h-4 w-4" /> Last Activity
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {!isOnline ? (
                            <span className="text-xs text-red-600">—</span>
                        ) : stats!.lastActivityAt ? (
                            <div className="text-sm font-medium">{format(new Date(stats!.lastActivityAt), "dd MMM yyyy, HH:mm")}</div>
                        ) : (
                            <div className="text-sm text-muted-foreground">No activity</div>
                        )}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                            {isOnline ? <ShieldCheck className="h-4 w-4 text-emerald-500" /> : <AlertTriangle className="h-4 w-4 text-red-500" />} Connection
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {isOnline ? (
                            <div className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Online</div>
                        ) : (
                            <div className="text-sm font-medium text-red-600 dark:text-red-400" title={stats?.error ?? ""}>Offline</div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* DB info */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base"><Database className="h-4 w-4" /> Database</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                    <div>
                        <span className="text-muted-foreground">Status:</span> {statusBadge(tenant.status)}
                    </div>
                    <div>
                        <span className="text-muted-foreground">Plan:</span> <Badge variant="outline">{tenant.plan}</Badge>
                    </div>
                    <div>
                        <span className="text-muted-foreground">dbUrl:</span>
                        <code className="ml-2 text-xs font-mono break-all">{tenant.dbUrl}</code>
                    </div>
                    <div>
                        <span className="text-muted-foreground">Tenant ID:</span>
                        <code className="ml-2 text-xs font-mono">{tenant.id}</code>
                    </div>
                </CardContent>
            </Card>

            {/* Users management */}
            <TenantUsersClient tenantId={tenant.id} initialUsers={users} />

            {/* Backups */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base"><Database className="h-4 w-4" /> Backups (R2, {backups.length})</CardTitle>
                </CardHeader>
                <CardContent>
                    {backups.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Belum ada backup tercatat.</p>
                    ) : (
                        <div className="space-y-2">
                            {backups.map(b => (
                                <div key={b.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                                    <div>
                                        <div className="font-medium">{format(new Date(b.createdAt), "dd MMM yyyy, HH:mm:ss")}</div>
                                        <div className="text-xs text-muted-foreground">
                                            {formatBytes(b.sizeBytes)} · {b.triggeredBy}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Audit logs (recent, for this tenant only) */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Recent audit log ({auditLogs.length})</CardTitle>
                </CardHeader>
                <CardContent>
                    {auditLogs.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Belum ada aktivitas.</p>
                    ) : (
                        <div className="space-y-2">
                            {auditLogs.map(log => (
                                <div key={`${log.source}-${log.id}`} className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-sm border-b pb-2 last:border-0">
                                    <div>
                                        <Badge className="font-mono text-[10px] mr-2">{log.action}</Badge>
                                        <span className="text-muted-foreground">{log.user?.email ?? log.userId}</span>
                                        {log.details && <span className="ml-2 text-xs">{log.details}</span>}
                                    </div>
                                    <span className="text-xs text-muted-foreground">{format(new Date(log.createdAt), "dd MMM, HH:mm")}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
