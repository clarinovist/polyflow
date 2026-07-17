'use client';

import { useState, useEffect } from 'react';
import { Role } from '@prisma/client';
import { getUsers, createUser, updateUser, deleteUser, reactivateUser, setUserRoles, CreateUserInput, UpdateUserInput } from '@/actions/admin/users';
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
import { Plus, Trash2, Loader2, Pencil, RotateCcw, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

interface UserData {
    id: string;
    name: string | null;
    email: string;
    role: Role;
    roles: Role[];
    isActive: boolean;
    createdAt: Date;
}

const USER_ROLES: { value: Role; label: string }[] = [
    { value: 'ADMIN', label: 'Admin' },
    { value: 'PLANNING', label: 'Planning' },
    { value: 'WAREHOUSE', label: 'Warehouse' },
    { value: 'PRODUCTION', label: 'Production' },
    { value: 'SALES', label: 'Sales' },
    { value: 'FINANCE', label: 'Finance' },
    { value: 'PROCUREMENT', label: 'Procurement' },
];

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

    const [editRoles, setEditRoles] = useState<Role[]>([]);

    const [confirmPassword, setConfirmPassword] = useState('');
    const [editConfirmPassword, setEditConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [showEditPassword, setShowEditPassword] = useState(false);
    const [showEditConfirmPassword, setShowEditConfirmPassword] = useState(false);

    const fetchUsers = async () => {
        const result = await getUsers();
        if (result.success && result.data) {
            setUsers(result.data as UserData[]);
        } else {
            toast.error('Gagal memuat pengguna');
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const handleCreate = async () => {
        if (!formData.name || !formData.email || !formData.password) {
            toast.error('Semua field wajib diisi');
            return;
        }
        if (formData.password.length < 6) {
            toast.error('Kata sandi minimal 6 karakter');
            return;
        }
        if (formData.password !== confirmPassword) {
            toast.error('Konfirmasi kata sandi tidak cocok');
            return;
        }
        setIsSubmitting(true);
        const result = await createUser(formData);
        if (result.success) {
            toast.success('Pengguna berhasil dibuat.');
            setCreateOpen(false);
            setFormData({ name: '', email: '', password: '', role: 'WAREHOUSE' });
            setConfirmPassword('');
            fetchUsers();
        } else {
            toast.error(result.error || 'Gagal membuat pengguna');
        }
        setIsSubmitting(false);
    };

    const handleUpdate = async () => {
        if (editData.password) {
            if (editData.password.length < 6) {
                toast.error('Kata sandi baru minimal 6 karakter');
                return;
            }
            if (editData.password !== editConfirmPassword) {
                toast.error('Konfirmasi kata sandi baru tidak cocok');
                return;
            }
        }
        if (editRoles.length === 0) {
            toast.error('Pengguna harus memiliki minimal satu peran');
            return;
        }
        setIsSubmitting(true);
        const primaryRole = editRoles.includes(editData.role as Role) ? editData.role : editRoles[0];
        const updateResult = await updateUser({
            id: editData.id,
            name: editData.name,
            email: editData.email,
            password: editData.password,
            role: primaryRole,
        });

        if (updateResult.success) {
            const roleResult = await setUserRoles(editData.id, editRoles);
            if (roleResult.success) {
                toast.success('Pengguna berhasil diperbarui.');
                setEditOpen(false);
                setEditConfirmPassword('');
                fetchUsers();
            } else {
                toast.error(roleResult.error || 'Gagal memperbarui peran pengguna');
            }
        } else {
            toast.error(updateResult.error || 'Gagal memperbarui informasi pengguna');
        }
        setIsSubmitting(false);
    };

    const handleDeactivate = async (userId: string) => {
        if (!confirm('Yakin ingin menonaktifkan pengguna ini? User tidak akan bisa login, tetapi histori transaksi tetap aman.')) return;

        const result = await deleteUser(userId);
        if (result.success) {
            toast.success('Pengguna berhasil dinonaktifkan.');
            fetchUsers();
        } else {
            toast.error(result.error);
        }
    };

    const handleReactivate = async (userId: string) => {
        const result = await reactivateUser(userId);
        if (result.success) {
            toast.success('Pengguna berhasil diaktifkan kembali.');
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
        setEditRoles(user.roles?.length ? user.roles : [user.role]);
        setEditConfirmPassword('');
        setShowEditPassword(false);
        setShowEditConfirmPassword(false);
        setEditOpen(true);
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle>User Management</CardTitle>
                    <CardDescription>
                        Kelola akses sistem dan peran.
                    </CardDescription>
                </div>
                <Dialog open={createOpen} onOpenChange={(open) => {
                    setCreateOpen(open);
                    if (!open) {
                        setFormData({ name: '', email: '', password: '', role: 'WAREHOUSE' });
                        setConfirmPassword('');
                        setShowPassword(false);
                        setShowConfirmPassword(false);
                    }
                }}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="mr-2 h-4 w-4" />
                            Tambah Pengguna
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Buat Pengguna Baru</DialogTitle>
                            <DialogDescription>
                                Tambahkan pengguna baru ke sistem. Pengguna akan memakai email ini untuk login.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label htmlFor="name">Nama Lengkap</Label>
                                <Input
                                    id="name"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="email">Email</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="password">Kata Sandi</Label>
                                <div className="relative">
                                    <Input
                                        id="password"
                                        type={showPassword ? "text" : "password"}
                                        value={formData.password}
                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                        className="pr-10"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="confirm-password">Konfirmasi Kata Sandi</Label>
                                <div className="relative">
                                    <Input
                                        id="confirm-password"
                                        type={showConfirmPassword ? "text" : "password"}
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        className="pr-10"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="role">Role Utama</Label>
                                <Select
                                    value={formData.role}
                                    onValueChange={(val: Role) => setFormData({ ...formData, role: val })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Pilih peran" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {USER_ROLES.map((role) => (
                                            <SelectItem key={role.value} value={role.value}>
                                                {role.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground mt-1">
                                    * Multi-role bisa ditambahkan setelah pengguna dibuat (Edit).
                                </p>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={isSubmitting}>
                                Batal
                            </Button>
                            <Button onClick={handleCreate} disabled={isSubmitting}>
                                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Buat Pengguna
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
                                    <TableHead>Nama</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Peran</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Aksi</TableHead>
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
                                                {user.name || 'Tidak diketahui'}
                                            </div>
                                        </TableCell>
                                        <TableCell>{user.email}</TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-1">
                                                {user.roles?.map((role) => (
                                                    <Badge key={role} variant={role === user.role ? "default" : "outline"}>
                                                        {role}
                                                    </Badge>
                                                )) || <Badge variant="default">{user.role}</Badge>}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={user.isActive ? 'default' : 'secondary'}>
                                                {user.isActive ? 'Aktif' : 'Nonaktif'}
                                            </Badge>
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
                                                    className={
                                                        user.isActive
                                                            ? "h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                                            : "h-8 w-8 text-muted-foreground hover:text-emerald-600 hover:bg-emerald-500/10"
                                                    }
                                                    onClick={() => user.isActive ? handleDeactivate(user.id) : handleReactivate(user.id)}
                                                    title={user.isActive ? 'Nonaktifkan pengguna' : 'Aktifkan pengguna'}
                                                >
                                                    {user.isActive ? <Trash2 className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>

                        {/* Edit User Dialog */}
                        <Dialog open={editOpen} onOpenChange={(open) => {
                            setEditOpen(open);
                            if (!open) {
                                setEditConfirmPassword('');
                                setShowEditPassword(false);
                                setShowEditConfirmPassword(false);
                            }
                        }}>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Ubah Pengguna</DialogTitle>
                                    <DialogDescription>
                                        Perbarui informasi pengguna. Kosongkan kata sandi jika tidak ingin mengubah kata sandi saat ini.
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="grid gap-4 py-4">
                                    <div className="grid gap-2">
                                        <Label htmlFor="edit-name">Nama Lengkap</Label>
                                        <Input
                                            id="edit-name"
                                            value={editData.name}
                                            onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="edit-email">Email</Label>
                                        <Input
                                            id="edit-email"
                                            type="email"
                                            value={editData.email}
                                            onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="edit-password">Kata Sandi Baru (Opsional)</Label>
                                        <div className="relative">
                                            <Input
                                                id="edit-password"
                                                type={showEditPassword ? "text" : "password"}
                                                placeholder="••••••••"
                                                value={editData.password}
                                                onChange={(e) => setEditData({ ...editData, password: e.target.value })}
                                                className="pr-10"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowEditPassword(!showEditPassword)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                            >
                                                {showEditPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="edit-confirm-password">Konfirmasi Kata Sandi Baru</Label>
                                        <div className="relative">
                                            <Input
                                                id="edit-confirm-password"
                                                type={showEditConfirmPassword ? "text" : "password"}
                                                placeholder="••••••••"
                                                value={editConfirmPassword}
                                                onChange={(e) => setEditConfirmPassword(e.target.value)}
                                                className="pr-10"
                                                disabled={!editData.password}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowEditConfirmPassword(!showEditConfirmPassword)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                                disabled={!editData.password}
                                            >
                                                {showEditConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="grid gap-2">
                                        <Label>Peran Pengguna (Roles)</Label>
                                        <div className="grid grid-cols-2 gap-2 border rounded-md p-3">
                                            {USER_ROLES.map((role) => {
                                                const checked = editRoles.includes(role.value);
                                                return (
                                                    <div key={role.value} className="flex items-center space-x-2">
                                                        <input
                                                            type="checkbox"
                                                            id={`edit-role-${role.value}`}
                                                            checked={checked}
                                                            onChange={() => {
                                                                if (checked) {
                                                                    setEditRoles(editRoles.filter((r) => r !== role.value));
                                                                } else {
                                                                    setEditRoles([...editRoles, role.value]);
                                                                }
                                                            }}
                                                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                                        />
                                                        <Label htmlFor={`edit-role-${role.value}`} className="cursor-pointer">
                                                            {role.label}
                                                        </Label>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            Pilih satu atau lebih peran. Pengguna harus log out dan log in kembali agar perubahan peran aktif.
                                        </p>
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setEditOpen(false)} disabled={isSubmitting}>
                                        Batal
                                    </Button>
                                    <Button onClick={handleUpdate} disabled={isSubmitting}>
                                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Simpan Perubahan
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
