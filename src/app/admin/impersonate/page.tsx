import { auth, signOut } from "@/auth";
import { prisma, getTenantDb } from "@/lib/core/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShieldAlert, LogOut, ExternalLink } from "lucide-react";
import { logActivity } from "@/lib/tools/audit";

export const dynamic = "force-dynamic";

export default async function ImpersonationView({
    searchParams,
}: {
    searchParams: Promise<{ tenantId?: string; userId?: string }>;
}) {
    const session = await auth();
    // Must be actively impersonating to land here. authorized() in auth.config
    // already bounces non-impersonating users.
    if (!session?.user || !(session.user as { impersonatedBy?: string }).impersonatedBy) {
        redirect("/super-admin");
    }

    const { tenantId, userId } = await searchParams;
    if (!tenantId) redirect("/super-admin");

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) redirect("/super-admin");

    // We're on the admin subdomain — the AsyncLocalStorage tenant pipe
    // doesn't apply. Reach into the tenant DB directly via its dbUrl.
    const tenantDb = getTenantDb(tenant.dbUrl);
    const [impersonatedUser, users, recentAudit] = await Promise.all([
        userId ? tenantDb.user.findUnique({ where: { id: userId } }) : null,
        tenantDb.user.findMany({
            orderBy: { createdAt: "asc" },
            take: 20,
            select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true, updatedAt: true },
        }),
        tenantDb.auditLog.findMany({
            orderBy: { createdAt: "desc" },
            take: 15,
            include: { user: { select: { name: true, email: true } } },
        }),
    ]);

    // Audit log the impersonation ENTERING the view (one-time, the START was
    // logged in the action). Best-effort — don't fail the page on audit-log error.
    logActivity({
        userId: session.user.id!,
        action: "IMPERSONATION_VIEW_ENTERED",
        entityType: "Tenant",
        entityId: tenant.id,
        details: `Viewing tenant "${tenant.name}" as ${impersonatedUser?.email ?? "(unknown user)"} in impersonation mode.`,
    }).catch(() => {});

    const expiresAt = (session.user as { impersonationExpiresAt?: number }).impersonationExpiresAt;
    const expiresAtStr = expiresAt ? new Date(expiresAt * 1000).toLocaleString() : "?";

    async function exitImpersonation() {
        "use server";
        const sess = await auth();
        if (sess?.user) {
            const u = sess.user as { id?: string; impersonatedBy?: string };
            if (u.impersonatedBy && u.id) {
                await logActivity({
                    userId: u.impersonatedBy,
                    action: "IMPERSONATION_EXITED",
                    entityType: "Tenant",
                    entityId: tenant!.id,
                    details: `Exited impersonation of ${impersonatedUser?.email ?? "tenant user"}.`,
                });
            }
        }
        await signOut({ redirect: false });
        redirect("/super-admin");
    }

    return (
        <div className="min-h-screen bg-secondary/30">
            {/* Impersonation banner — fixed at top, cannot be dismissed */}
            <div className="sticky top-0 z-50 bg-amber-500 text-black px-4 py-2 shadow-lg">
                <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                        <ShieldAlert className="h-5 w-5" />
                        <span>IMPERSONATING: {impersonatedUser?.name ?? "tenant user"} ({impersonatedUser?.email ?? "?"})</span>
                        <span className="opacity-70">· tenant: {tenant.name}</span>
                        <span className="opacity-70">· expires {expiresAtStr}</span>
                    </div>
                    <form action={exitImpersonation}>
                        <Button type="submit" variant="default" size="sm" className="bg-black text-white hover:bg-zinc-800 gap-2">
                            <LogOut className="h-4 w-4" /> Exit Impersonation
                        </Button>
                    </form>
                </div>
            </div>

            <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Impersonation: {tenant.name}</h1>
                        <p className="text-sm text-muted-foreground">
                            You are acting as <strong>{impersonatedUser?.email ?? "tenant user"}</strong> (role: ADMIN)
                            on tenant <strong>{tenant.name}</strong>. All actions taken here are audit-logged under your
                            superadmin ID.
                        </p>
                    </div>
                    <Button asChild variant="outline" size="sm">
                        <a href={`https://${tenant.subdomain}.polyflow.uk`} target="_blank" rel="noreferrer">
                            <ExternalLink className="h-4 w-4" /> Buka workspace tenant (login sendiri)
                        </a>
                    </Button>
                </div>

                {/* Users summary (read-only view for safety, MVP) */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Users di tenant ini ({users.length})</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Role</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Created</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {users.map(u => (
                                    <TableRow key={u.id}>
                                        <TableCell className="font-medium">{u.name || "—"}</TableCell>
                                        <TableCell className="font-mono text-xs">{u.email}</TableCell>
                                        <TableCell>{u.role}</TableCell>
                                        <TableCell>
                                            {u.isActive ? (
                                                <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">active</Badge>
                                            ) : (
                                                <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">inactive</Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-xs">{new Date(u.createdAt).toLocaleDateString()}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                {/* Recent audit activity */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Recent tenant activity ({recentAudit.length})</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {recentAudit.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Belum ada aktivitas di tenant ini.</p>
                        ) : (
                            <div className="space-y-2">
                                {recentAudit.map(l => (
                                    <div key={l.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-sm border-b pb-2 last:border-0">
                                        <div>
                                            <Badge className="font-mono text-[10px] mr-2">{l.action}</Badge>
                                            <span className="text-muted-foreground">{l.user?.email ?? l.userId}</span>
                                            {l.details && <span className="ml-2 text-xs">{l.details}</span>}
                                        </div>
                                        <span className="text-xs text-muted-foreground">{new Date(l.createdAt).toLocaleString()}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
