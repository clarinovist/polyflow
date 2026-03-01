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
import { createAndProvisionTenant, updateTenant, resetTenantAdminPassword } from "@/actions/admin-actions";
import { Edit, KeyRound } from "lucide-react";

function EditTenantDialog({ tenant, onUpdated }: { tenant: Tenant, onUpdated: () => void }) {
    const [isOpen, setIsOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    async function onSubmit(formData: FormData) {
        setIsSubmitting(true);
        const name = formData.get("name") as string;
        const result = await updateTenant(tenant.id, formData);

        if (result.error) {
            toast.error(result.error);
        } else {
            toast.success(`${name} updated successfully!`);
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
                                <SelectItem value="INACTIVE">Inactive</SelectItem>
                                <SelectItem value="SUSPENDED">Suspended</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setIsOpen(false)} disabled={isSubmitting}>Cancel</Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? "Saving..." : "Save Changes"}
                        </Button>
                    </DialogFooter>
                </form>
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

        if (result.error) {
            toast.error(result.error);
        } else {
            toast.success(`Admin password for ${tenant.name} has been reset!`);
            setIsOpen(false);
        }
        setIsSubmitting(false);
    }

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 shadow-none border gap-2 text-orange-600 hover:text-orange-700 hover:bg-orange-50">
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

export function SuperAdminClient({ initialTenants }: { initialTenants: Tenant[] }) {
    const [tenants] = useState(initialTenants);
    const [isOpen, setIsOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    async function onSubmit(formData: FormData) {
        setIsSubmitting(true);
        const name = formData.get("name") as string;

        toast.promise(createAndProvisionTenant(formData), {
            loading: `Provisioning ${name}... Please wait, this takes about 30 seconds...`,
            success: (result) => {
                if (result.error) {
                    throw new Error(result.error);
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
                            <TableHead>Created</TableHead>
                            <TableHead className="text-right">Database URL</TableHead>
                            <TableHead className="text-right w-[100px]">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {tenants.map(t => (
                            <TableRow key={t.id}>
                                <TableCell className="font-medium">{t.name}</TableCell>
                                <TableCell><code>{t.subdomain}</code></TableCell>
                                <TableCell>{t.status}</TableCell>
                                <TableCell>{new Date(t.createdAt).toLocaleDateString()}</TableCell>
                                <TableCell className="text-right max-w-[200px] truncate" title={t.dbUrl}>
                                    <span className="text-xs text-muted-foreground font-mono">{t.dbUrl}</span>
                                </TableCell>
                                <TableCell className="text-right flex items-center justify-end gap-2 pr-4">
                                    <ResetPasswordDialog tenant={t} />
                                    <EditTenantDialog tenant={t} onUpdated={() => window.location.reload()} />
                                </TableCell>
                            </TableRow>
                        ))}
                        {tenants.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                                    No tenants found. Start onboarding!
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}
