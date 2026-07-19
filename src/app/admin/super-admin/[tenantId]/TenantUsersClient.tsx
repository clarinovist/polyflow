"use client";

import { useState } from "react";
import type { TenantUserRow } from "@/actions/admin/tenant-users";
import { setTenantUserStatus, createTenantUser, deleteTenantUser } from "@/actions/admin/tenant-users";
import { Role } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { UserPlus, Trash2, Loader2, Ban, PlayCircle } from "lucide-react";

export default function TenantUsersClient({
    tenantId,
    initialUsers,
}: {
    tenantId: string;
    initialUsers: TenantUserRow[];
}) {
    const [users, setUsers] = useState(initialUsers);
    const [busy, setBusy] = useState<string | null>(null);
    const [showCreate, setShowCreate] = useState(false);

    async function toggleActive(userId: string, current: boolean) {
        setBusy(userId);
        try {
            const r = await setTenantUserStatus(tenantId, userId, !current);
            if (!r.success) throw new Error();
            setUsers(u => u.map(x => x.id === userId ? { ...x, isActive: !current } : x));
            toast.success(!current ? "User diaktifkan." : "User disuspend.");
        } catch {
            toast.error("Gagal mengubah status user.");
        } finally {
            setBusy(null);
        }
    }

    async function onDelete(userId: string, email: string) {
        if (!confirm(`Hapus user ${email}? Tindakan ini permanen.`)) return;
        setBusy(userId);
        try {
            const r = await deleteTenantUser(tenantId, userId);
            if (!r.success) throw new Error();
            setUsers(u => u.filter(x => x.id !== userId));
            toast.success("User dihapus.");
        } catch {
            toast.error("Gagal menghapus user.");
        } finally {
            setBusy(null);
        }
    }

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Users ({users.length})</CardTitle>
                <Dialog open={showCreate} onOpenChange={setShowCreate}>
                    <DialogTrigger asChild>
                        <Button size="sm" variant="outline"><UserPlus className="h-4 w-4" /> Tambah User</Button>
                    </DialogTrigger>
                    <CreateUserDialog tenantId={tenantId} onCreated={() => { setShowCreate(false); window.location.reload(); }} />
                </Dialog>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
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
                                <TableCell className="flex justify-end gap-1">
                                    <Button variant="ghost" size="sm" className="h-7" onClick={() => toggleActive(u.id, u.isActive)} disabled={busy === u.id} title={u.isActive ? "Suspend" : "Activate"}>
                                        {busy === u.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : u.isActive ? <Ban className="h-3.5 w-3.5" /> : <PlayCircle className="h-3.5 w-3.5" />}
                                    </Button>
                                    <Button variant="ghost" size="sm" className="h-7 text-red-600 hover:bg-red-50" onClick={() => onDelete(u.id, u.email)} disabled={busy === u.id} title="Delete">
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                        {users.length === 0 && (
                            <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Belum ada user.</TableCell></TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}

function CreateUserDialog({ tenantId, onCreated }: { tenantId: string; onCreated: () => void }) {
    const [isSubmitting, setIsSubmitting] = useState(false);

    async function onSubmit(formData: FormData) {
        setIsSubmitting(true);
        try {
            const r = await createTenantUser(tenantId, {
                name: String(formData.get("name") ?? ""),
                email: String(formData.get("email") ?? ""),
                password: String(formData.get("password") ?? ""),
                role: (formData.get("role") as Role) || Role.WAREHOUSE,
            });
            if (!r.success) throw new Error();
            toast.success("User dibuat.");
            onCreated();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Gagal membuat user.");
            setIsSubmitting(false);
        }
    }

    return (
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Tambah User Tenant</DialogTitle>
                <DialogDescription>User baru akan dibuat di database tenant ini.</DialogDescription>
            </DialogHeader>
            <form action={onSubmit} className="space-y-4 py-4">
                <div className="space-y-2">
                    <Label htmlFor="name">Nama</Label>
                    <Input id="name" name="name" required />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" name="email" type="email" required />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input id="password" name="password" type="password" required minLength={6} />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="role">Role</Label>
                    <Select name="role" defaultValue={Role.WAREHOUSE}>
                        <SelectTrigger id="role"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {Object.values(Role).map(r => (
                                <SelectItem key={r} value={r}>{r}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <DialogFooter>
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? "Membuat…" : "Buat User"}
                    </Button>
                </DialogFooter>
            </form>
        </DialogContent>
    );
}
