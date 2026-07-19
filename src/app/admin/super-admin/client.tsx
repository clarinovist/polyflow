"use client";

import { useState } from "react";
import { Tenant } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { createAndProvisionTenant, updateTenant, resetTenantAdminPassword, setTenantStatus } from "@/actions/admin/admin-actions";
import { globalUserSearch, type GlobalUserResult } from "@/actions/admin/global-search";
import { backupTenant, listTenantBackups, getTenantBackupDownloadUrl, deleteTenant } from "@/actions/admin/tenant-backup";
import type { TenantStats } from "@/actions/admin/tenant-observability";
import { Edit, KeyRound, Users, HardDrive, Clock, AlertTriangle, Ban, PlayCircle, Search, Loader2, ExternalLink, Database, Trash2, Download } from "lucide-react";

function EditTenantDialog({ tenant, onUpdated }: { tenant: Tenant, onUpdated: () => void }) {
    const [isOpen, setIsOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    async function onSubmit(formData: FormData) {
        setIsSubmitting(true);
        const name = formData.get("name") as string;
        const result = await updateTenant(tenant.id, formData);

        if (!result.success) {
            toast.error(result.error || 'Gagal memproses. Silakan coba lagi.');
        } else {
            toast.success(`${name} berhasil diperbarui.`);
            setIsOpen(false);
            onUpdated();
        }
        setIsSubmitting(false);
    }

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 shadow-none border gap-2">
                    <Edit className="h-4 w-4" /> Edit
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Edit Tenant: {tenant.name}</DialogTitle>
                    <DialogDescription>
                        Update system-level information for this tenant. Be careful when updating subdomain or DB URL.
                    </DialogDescription>
                </DialogHeader>
                <form action={onSubmit} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor={`name-${tenant.id}`}>Company Name</Label>
                        <Input id={`name-${tenant.id}`} name="name" required defaultValue={tenant.name} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor={`subdomain-${tenant.id}`}>Subdomain</Label>
                        <Input id={`subdomain-${tenant.id}`} name="subdomain" required defaultValue={tenant.subdomain} pattern="[a-z0-9-]+" />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor={`dbUrl-${tenant.id}`}>Database URL</Label>
                        <Input id={`dbUrl-${tenant.id}`} name="dbUrl" defaultValue={tenant.dbUrl} type="text" className="font-mono text-xs" />
                        <p className="text-xs text-muted-foreground">Leave as is unless migrating databases.</p>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor={`status-${tenant.id}`}>Status</Label>
                        <Select name="status" defaultValue={tenant.status}>
                            <SelectTrigger id={`status-${tenant.id}`}>
                                <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ACTIVE">Active</SelectItem>
                                <SelectItem value="TRIAL">Trial</SelectItem>
                                <SelectItem value="SUSPENDED">Suspended</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setIsOpen(false)} disabled={isSubmitting}>Cancel</Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? 'Menyimpan...' : 'Simpan Perubahan'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function BackupActions({ tenant }: { tenant: Tenant; onChanged: () => void }) {
    const [isBackingUp, setIsBackingUp] = useState(false);
    const [showBackups, setShowBackups] = useState(false);
    const [backups, setBackups] = useState<{ id: string; r2Key: string; sizeBytes: number; createdAt: Date; triggeredBy: string }[]>([]);
    const [loadingBackups, setLoadingBackups] = useState(false);
    const [downloadingId, setDownloadingId] = useState<string | null>(null);

    async function onBackup() {
        setIsBackingUp(true);
        try {
            const result = await backupTenant(tenant.id);
            if (!result.success) throw new Error("failed");
            toast.success(`Backup tenant "${tenant.name}" tersimpan di R2 (${(result.sizeBytes / 1024 / 1024).toFixed(2)} MB).`);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Gagal backup.");
        } finally {
            setIsBackingUp(false);
        }
    }

    async function loadBackups() {
        setLoadingBackups(true);
        try {
            const list = await listTenantBackups(tenant.id);
            setBackups(list);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Gagal memuat daftar backup.");
        } finally {
            setLoadingBackups(false);
        }
    }

    async function download(backupId: string) {
        setDownloadingId(backupId);
        try {
            const url = await getTenantBackupDownloadUrl(backupId);
            window.open(url, "_blank");
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Gagal membuat link download.");
        } finally {
            setDownloadingId(null);
        }
    }

    function formatBytes(n: number) {
        if (n === 0) return "0 B";
        const units = ["B", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(n) / Math.log(1024));
        return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
    }

    return (
        <>
            <Button variant="ghost" size="sm" className="h-8 shadow-none border gap-2" onClick={onBackup} disabled={isBackingUp}>
                {isBackingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
                Backup
            </Button>
            <Button variant="ghost" size="sm" className="h-8 shadow-none border gap-2" onClick={() => { setShowBackups(true); loadBackups(); }} title="Daftar backup di R2">
                <Database className="h-4 w-4" />
            </Button>

            <Dialog open={showBackups} onOpenChange={setShowBackups}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Backups: {tenant.name}</DialogTitle>
                        <DialogDescription>Daftar backup tersimpan di R2.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 max-h-[60vh] overflow-auto">
                        {loadingBackups ? (
                            <div className="text-center py-6 text-muted-foreground">Memuat…</div>
                        ) : backups.length === 0 ? (
                            <div className="text-center py-6 text-muted-foreground">Belum ada backup.</div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Created</TableHead>
                                        <TableHead>Size</TableHead>
                                        <TableHead>Trigger</TableHead>
                                        <TableHead></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {backups.map(b => (
                                        <TableRow key={b.id}>
                                            <TableCell className="text-xs">{new Date(b.createdAt).toLocaleString()}</TableCell>
                                            <TableCell className="text-xs">{formatBytes(b.sizeBytes)}</TableCell>
                                            <TableCell className="text-xs">{b.triggeredBy}</TableCell>
                                            <TableCell>
                                                <Button variant="ghost" size="sm" className="h-7" onClick={() => download(b.id)} disabled={downloadingId === b.id}>
                                                    {downloadingId === b.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}

function DeleteTenantDialog({ tenant, onChanged }: { tenant: Tenant; onChanged: () => void }) {
    const [isOpen, setIsOpen] = useState(false);
    const [confirmText, setConfirmText] = useState("");
    const [isDeleting, setIsDeleting] = useState(false);
    const isSuspended = tenant.status === "SUSPENDED";
    const canSubmit = confirmText === tenant.subdomain && isSuspended;

    async function onConfirm() {
        if (!canSubmit) return;
        setIsDeleting(true);
        try {
            const result = await deleteTenant(tenant.id, confirmText);
            if (!result.success) throw new Error("failed");
            toast.success(`Tenant "${tenant.name}" permanently deleted. Pre-delete backup saved to R2.`);
            setIsOpen(false);
            onChanged();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Gagal menghapus tenant.");
        } finally {
            setIsDeleting(false);
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={(o) => { setIsOpen(o); if (!o) setConfirmText(""); }}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 shadow-none border gap-2 text-red-600 dark:text-red-400 hover:bg-red-50 hover:dark:bg-red-900/30" disabled={!isSuspended} title={isSuspended ? "Delete tenant permanently" : "Suspend tenant first (cooling period)"}>
                    <Trash2 className="h-4 w-4" />
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle className="text-red-600 dark:text-red-400">Delete Tenant: {tenant.name}</DialogTitle>
                    <DialogDescription>
                        This is <strong>irreversible</strong>. The tenant&apos;s database will be dropped permanently.
                        A pre-delete backup will be saved to R2 first — if that backup fails, the deletion is aborted.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-3 border border-red-200 dark:border-red-800 text-sm text-red-800 dark:text-red-300">
                        <p>Type the tenant subdomain <code className="font-mono font-bold">{tenant.subdomain}</code> to confirm:</p>
                    </div>
                    <Input
                        type="text"
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        placeholder={tenant.subdomain}
                        className="font-mono"
                        autoFocus
                    />
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsOpen(false)} disabled={isDeleting}>Cancel</Button>
                    <Button type="button" variant="destructive" onClick={onConfirm} disabled={!canSubmit || isDeleting}>
                        {isDeleting ? "Deleting (backup in progress)…" : "Delete Permanently"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function SuspendToggleDialog({ tenant, onChanged }: { tenant: Tenant; onChanged: () => void }) {
    const [isOpen, setIsOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const isSuspended = tenant.status === "SUSPENDED";
    const nextStatus = isSuspended ? "ACTIVE" : "SUSPENDED";

    async function onConfirm() {
        setIsSubmitting(true);
        const result = await setTenantStatus(tenant.id, nextStatus);

        if (!result.success) {
            toast.error(result.error || "Gagal memproses. Silakan coba lagi.");
        } else {
            toast.success(
                isSuspended
                    ? `${tenant.name} diaktifkan kembali. Login sudah diizinkan.`
                    : `${tenant.name} disuspend. Semua login pada subdomain ini akan diblokir.`
            );
            setIsOpen(false);
            onChanged();
        }
        setIsSubmitting(false);
    }

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                {isSuspended ? (
                    <Button variant="ghost" size="sm" className="h-8 shadow-none border gap-2 text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 hover:bg-emerald-50 hover:dark:bg-emerald-900/30">
                        <PlayCircle className="h-4 w-4" /> Activate
                    </Button>
                ) : (
                    <Button variant="ghost" size="sm" className="h-8 shadow-none border gap-2 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 hover:dark:bg-red-900/30">
                        <Ban className="h-4 w-4" /> Suspend
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{isSuspended ? "Reactivate" : "Suspend"} Tenant: {tenant.name}</DialogTitle>
                    <DialogDescription>
                        {isSuspended
                            ? "This restores login access for all users on this tenant's subdomain."
                            : "This immediately blocks ALL logins on this tenant's subdomain. Existing sessions will remain valid until they expire or the user is signed out — this only prevents new logins."}
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsOpen(false)} disabled={isSubmitting}>Cancel</Button>
                    <Button
                        type="button"
                        variant={isSuspended ? "default" : "destructive"}
                        onClick={onConfirm}
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? "Processing..." : isSuspended ? "Confirm Reactivate" : "Confirm Suspend"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function ResetPasswordDialog({ tenant }: { tenant: Tenant }) {
    const [isOpen, setIsOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    async function onSubmit(formData: FormData) {
        setIsSubmitting(true);
        const result = await resetTenantAdminPassword(tenant.id, formData);

        if (!result.success) {
            toast.error(result.error || 'Gagal memproses. Silakan coba lagi.');
        } else {
            toast.success(`Password admin untuk ${tenant.name} berhasil direset.`);
            setIsOpen(false);
        }
        setIsSubmitting(false);
    }

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 shadow-none border gap-2 text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 hover:bg-orange-50 hover:dark:bg-orange-900/30">
                    <KeyRound className="h-4 w-4" /> Reset Pwd
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Reset Admin Password: {tenant.name}</DialogTitle>
                    <DialogDescription>
                        This will override the primary admin account&apos;s password for this tenant.
                        Make sure to securely communicate the new password to the user.
                    </DialogDescription>
                </DialogHeader>
                <form action={onSubmit} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor={`newPassword-${tenant.id}`}>New Admin Password</Label>
                        <Input
                            id={`newPassword-${tenant.id}`}
                            name="newPassword"
                            type="password"
                            required
                            minLength={6}
                            placeholder="Enter new password (min 6 chars)"
                        />
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setIsOpen(false)} disabled={isSubmitting}>Cancel</Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? "Resetting..." : "Confirm Reset"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function formatBytes(bytes: number | null): string {
    if (bytes == null) return "—";
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatRelativeTime(iso: string | null): string {
    if (!iso) return "No activity";
    const then = new Date(iso).getTime();
    const diffMs = Date.now() - then;
    const sec = Math.floor(diffMs / 1000);
    if (sec < 60) return "just now";
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    if (day < 30) return `${day}d ago`;
    return new Date(iso).toLocaleDateString();
}

function GlobalUserSearchBar() {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<GlobalUserResult[] | null>(null);
    const [loading, setLoading] = useState(false);

    async function onSearch(e: React.FormEvent) {
        e.preventDefault();
        if (query.trim().length < 2) return;
        setLoading(true);
        setResults(null);
        try {
            const r = await globalUserSearch(query);
            setResults(r);
            if (r.length === 0) toast.info("Tidak ada user yang cocok.");
        } catch {
            toast.error("Gagal mencari. Silakan coba lagi.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <Search className="h-4 w-4" /> Global User Search
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                    Cari user berdasarkan email atau nama di semua tenant (main DB + tenant DB).
                </p>
            </CardHeader>
            <CardContent className="space-y-4">
                <form onSubmit={onSearch} className="flex gap-2">
                    <Input
                        type="text"
                        placeholder="Email atau nama user…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="max-w-md"
                    />
                    <Button type="submit" disabled={loading || query.trim().length < 2}>
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                        Cari
                    </Button>
                </form>

                {results && results.length > 0 && (
                    <div className="rounded-md border overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>User</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Role</TableHead>
                                    <TableHead>Source / Tenant</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="w-[80px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {results.map((u) => (
                                    <TableRow key={`${u.source}-${u.tenantId ?? "main"}-${u.id}`}>
                                        <TableCell className="font-medium">{u.name || "—"}</TableCell>
                                        <TableCell className="font-mono text-xs">{u.email}</TableCell>
                                        <TableCell>{u.role}</TableCell>
                                        <TableCell>
                                            {u.source === "main" ? (
                                                <span className="inline-flex items-center gap-1 text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 px-2 py-0.5 rounded">Platform</span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 text-xs font-medium bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300 px-2 py-0.5 rounded">
                                                    {u.tenantName}
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {u.isActive ? (
                                                <span className="text-xs text-emerald-600 dark:text-emerald-400">active</span>
                                            ) : (
                                                <span className="text-xs text-red-600 dark:text-red-400">inactive</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {u.tenantSubdomain ? (
                                                <a
                                                    href={`https://${u.tenantSubdomain}.polyflow.uk/login`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                                                    title={`Buka ${u.tenantSubdomain}.polyflow.uk`}
                                                >
                                                    <ExternalLink className="h-3 w-3" />
                                                </a>
                                            ) : null}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

export function SuperAdminClient({ initialTenants, stats }: { initialTenants: Tenant[]; stats: Record<string, TenantStats> }) {
    const [tenants] = useState(initialTenants);
    const [isOpen, setIsOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    async function onSubmit(formData: FormData) {
        setIsSubmitting(true);
        const name = formData.get("name") as string;

        toast.promise(createAndProvisionTenant(formData), {
            loading: `Provisioning ${name}... Please wait, this takes about 30 seconds...`,
            success: (result) => {
                if (!result.success) {
                    throw new Error(result.error || 'Gagal menjalankan perintah');
                }
                setIsOpen(false);
                // In a real app we'd revalidate path to fetch the new tenant from DB
                // but for now, we'll force a reload to get the fresh list
                window.location.reload();
                return `${name} provisioned successfully!`;
            },
            error: (err) => `Failed to provision: ${err.message}`
        });

        setIsSubmitting(false);
    }

    return (
        <div className="space-y-6">
            <GlobalUserSearchBar />
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Registered Tenants</CardTitle>
                <Dialog open={isOpen} onOpenChange={setIsOpen}>
                    <DialogTrigger asChild>
                        <Button>+ Onboard New Tenant</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Onboard New Tenant</DialogTitle>
                            <DialogDescription>
                                This will create a new isolated PostgreSQL Database, apply Prisma migrations, and run the initial seeds. It will take a few moments.
                            </DialogDescription>
                        </DialogHeader>
                        <form action={onSubmit} className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Company Name</Label>
                                <Input id="name" name="name" required placeholder="Example: PT Jaya Makmur" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="subdomain">Subdomain (URL)</Label>
                                <Input id="subdomain" name="subdomain" required placeholder="jayamakmur" pattern="[a-z0-9-]+" title="Only lowercase letters, numbers, and hyphens" />
                                <p className="text-xs text-muted-foreground">Will be accessed at <code>subdomain.domain.com</code></p>
                            </div>

                            <hr className="my-4 border-muted" />
                            <h4 className="font-semibold text-sm">Initial Admin Account</h4>

                            <div className="space-y-2">
                                <Label htmlFor="adminName">Admin Name</Label>
                                <Input id="adminName" name="adminName" required placeholder="John Doe" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="adminEmail">Admin Email</Label>
                                <Input id="adminEmail" name="adminEmail" type="email" required placeholder="admin@jayamakmur.com" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="adminPassword">Admin Password</Label>
                                <Input id="adminPassword" name="adminPassword" type="password" required placeholder="••••••••" minLength={8} />
                            </div>

                            <DialogFooter className="pt-4">
                                <Button type="submit" disabled={isSubmitting}>
                                    {isSubmitting ? "Provisioning Database..." : "Provision Tenant"}
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Tenant Name</TableHead>
                            <TableHead>Subdomain</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Users</TableHead>
                            <TableHead>DB Size</TableHead>
                            <TableHead>Last Activity</TableHead>
                            <TableHead className="text-right w-[100px]">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {tenants.map(t => {
                            const s = stats[t.id];
                            return (
                                <TableRow key={t.id}>
                                    <TableCell className="font-medium">{t.name}</TableCell>
                                    <TableCell><code>{t.subdomain}</code></TableCell>
                                    <TableCell>{t.status}</TableCell>
                                    {!s || !s.online ? (
                                        <TableCell colSpan={3}>
                                            <span className="inline-flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400" title={s?.error ?? "No stats"}>
                                                <AlertTriangle className="h-3.5 w-3.5" /> DB unreachable
                                            </span>
                                        </TableCell>
                                    ) : (
                                        <>
                                            <TableCell>
                                                <span className="inline-flex items-center gap-1.5 text-sm">
                                                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                                                    {s.activeUserCount}/{s.userCount}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <span className="inline-flex items-center gap-1.5 text-sm">
                                                    <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
                                                    {formatBytes(s.dbSizeBytes)}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                                                    <Clock className="h-3.5 w-3.5" />
                                                    {formatRelativeTime(s.lastActivityAt)}
                                                </span>
                                            </TableCell>
                                        </>
                                    )}
                                    <TableCell className="text-right flex items-center justify-end gap-2 pr-4">
                                        <SuspendToggleDialog tenant={t} onChanged={() => window.location.reload()} />
                                        <ResetPasswordDialog tenant={t} />
                                        <EditTenantDialog tenant={t} onUpdated={() => window.location.reload()} />
                                        <BackupActions tenant={t} onChanged={() => window.location.reload()} />
                                        <DeleteTenantDialog tenant={t} onChanged={() => window.location.reload()} />
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                        {tenants.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                                    Tidak ada tenant ditemukan. Mulai onboarding!
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
        </div>
    );
}
