'use client';

import { useState, useEffect } from 'react';
import { Role } from '@prisma/client';
import { getUsers, createUser, updateUser, deleteUser, CreateUserInput, UpdateUserInput } from '@/actions/users';
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
import { Plus, Trash2, Loader2, Pencil } from 'lucide-react';
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
    const [editOpen, setEditOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form state for creation
    const [formData, setFormData] = useState<CreateUserInput>({
        name: '',
        email: '',
        password: '',
        role: 'WAREHOUSE',
    });

    // Form state for editing
    const [editData, setEditData] = useState<UpdateUserInput>({
        id: '',
        name: '',
        email: '',
        password: '',
        role: 'WAREHOUSE',
    });

    const fetchUsers = async () => {
        const result = await getUsers();
        if (result.success && result.data) {
            setUsers(result.data);
        } else {
            toast.error('Failed to load users');
        }
        setLoading(false);
    };

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
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

    const handleUpdate = async () => {
        setIsSubmitting(true);
        const result = await updateUser(editData);
        if (result.success) {
            toast.success('User updated successfully');
            setEditOpen(false);
            fetchUsers();
        } else {
            toast.error(result.error || 'Failed to update user');
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

    const openEdit = (user: UserData) => {
        setEditData({
            id: user.id,
            name: user.name || '',
            email: user.email,
            role: user.role,
            password: '', // Always start empty
        });
        setEditOpen(true);
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
                    <>
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
                                            <Badge variant="outline">{user.role}</Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                                                    onClick={() => openEdit(user)}
                                                >
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                                    onClick={() => handleDelete(user.id)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>

                        {/* Edit User Dialog */}
                        <Dialog open={editOpen} onOpenChange={setEditOpen}>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Edit User</DialogTitle>
                                    <DialogDescription>
                                        Update user information. Leave password blank to keep current password.
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="grid gap-4 py-4">
                                    <div className="grid gap-2">
                                        <Label htmlFor="edit-name">Full Name</Label>
                                        <Input
                                            id="edit-name"
                                            value={editData.name}
                                            onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                                            className={classPresets.inputDefault}
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="edit-email">Email</Label>
                                        <Input
                                            id="edit-email"
                                            type="email"
                                            value={editData.email}
                                            onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                                            className={classPresets.inputDefault}
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="edit-password">New Password (Optional)</Label>
                                        <Input
                                            id="edit-password"
                                            type="password"
                                            placeholder="••••••••"
                                            value={editData.password}
                                            onChange={(e) => setEditData({ ...editData, password: e.target.value })}
                                            className={classPresets.inputDefault}
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="edit-role">Role</Label>
                                        <Select
                                            value={editData.role}
                                            onValueChange={(val: Role) => setEditData({ ...editData, role: val })}
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
                                    <Button variant="outline" onClick={() => setEditOpen(false)} disabled={isSubmitting}>
                                        Cancel
                                    </Button>
                                    <Button onClick={handleUpdate} disabled={isSubmitting} className={classPresets.buttonPrimary}>
                                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Save Changes
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </>
                )}
            </CardContent>
        </Card>
    );
}
