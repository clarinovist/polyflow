'use client';

import { useState, useEffect } from 'react';
import { Role } from '@prisma/client';
import { getUsers, createUser, updateUserRole, deleteUser, CreateUserInput } from '@/actions/users';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Loader2, UserCog } from 'lucide-react';
import { toast } from 'sonner';
import { classPresets } from '@/lib/design-tokens';

interface UserData {
    id: string;
    name: string | null;
    email: string;
    role: Role;
    createdAt: Date;
}

export function UsersTab() {
    const [users, setUsers] = useState<UserData[]>([]);
    const [loading, setLoading] = useState(true);
    const [createOpen, setCreateOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form state
    const [formData, setFormData] = useState<CreateUserInput>({
        name: '',
        email: '',
        password: '',
        role: 'WAREHOUSE',
    });

    const fetchUsers = async () => {
        setLoading(true);
        const result = await getUsers();
        if (result.success && result.data) {
            setUsers(result.data);
        } else {
            toast.error('Failed to load users');
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const handleCreate = async () => {
        setIsSubmitting(true);
        const result = await createUser(formData);
        if (result.success) {
            toast.success('User created successfully');
            setCreateOpen(false);
            setFormData({ name: '', email: '', password: '', role: 'WAREHOUSE' });
            fetchUsers();
        } else {
            toast.error(result.error || 'Failed to create user');
        }
        setIsSubmitting(false);
    };

    const handleDelete = async (userId: string) => {
        if (!confirm('Are you sure you want to delete this user?')) return;

        const result = await deleteUser(userId);
        if (result.success) {
            toast.success('User deleted');
            fetchUsers();
        } else {
            toast.error(result.error);
        }
    };

    const handleRoleChange = async (userId: string, newRole: Role) => {
        const result = await updateUserRole(userId, newRole);
        if (result.success) {
            toast.success('Role updated');
            // Optimistic update
            setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
        } else {
            toast.error(result.error);
        }
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle>User Management</CardTitle>
                    <CardDescription>
                        Manage system access and roles.
                    </CardDescription>
                </div>
                <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                    <DialogTrigger asChild>
                        <Button className={classPresets.buttonPrimary}>
                            <Plus className="mr-2 h-4 w-4" />
                            Add User
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Create New User</DialogTitle>
                            <DialogDescription>
                                Add a new user to the system. They will use this email to log in.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label htmlFor="name">Full Name</Label>
                                <Input
                                    id="name"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className={classPresets.inputDefault}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="email">Email</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    className={classPresets.inputDefault}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="password">Password</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    className={classPresets.inputDefault}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="role">Role</Label>
                                <Select
                                    value={formData.role}
                                    onValueChange={(val: Role) => setFormData({ ...formData, role: val })}
                                >
                                    <SelectTrigger className={classPresets.inputDefault}>
                                        <SelectValue placeholder="Select role" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="ADMIN">Admin</SelectItem>
                                        <SelectItem value="PPIC">PPIC</SelectItem>
                                        <SelectItem value="WAREHOUSE">Warehouse</SelectItem>
                                        <SelectItem value="PRODUCTION">Production</SelectItem>
                                        <SelectItem value="SALES">Sales</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={isSubmitting}>
                                Cancel
                            </Button>
                            <Button onClick={handleCreate} disabled={isSubmitting} className={classPresets.buttonPrimary}>
                                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Create User
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="flex h-48 items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Role</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {users.map((user) => (
                                <TableRow key={user.id}>
                                    <TableCell className="font-medium">
                                        <div className="flex items-center gap-2">
                                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
                                                {user.name?.[0]?.toUpperCase() || 'U'}
                                            </div>
                                            {user.name || 'Unknown'}
                                        </div>
                                    </TableCell>
                                    <TableCell>{user.email}</TableCell>
                                    <TableCell>
                                        <Select
                                            defaultValue={user.role}
                                            onValueChange={(val: Role) => handleRoleChange(user.id, val)}
                                        >
                                            <SelectTrigger className="w-[130px] h-8">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="ADMIN">Admin</SelectItem>
                                                <SelectItem value="PPIC">PPIC</SelectItem>
                                                <SelectItem value="WAREHOUSE">Warehouse</SelectItem>
                                                <SelectItem value="PRODUCTION">Production</SelectItem>
                                                <SelectItem value="SALES">Sales</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                            onClick={() => handleDelete(user.id)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    );
}
