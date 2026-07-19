'use client';

import { useState, useRef, useTransition } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Loader2, Eye, EyeOff, Upload, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
    updateOwnProfile,
    changeOwnPassword,
    updateOwnAvatar,
    removeOwnAvatar,
} from '@/actions/settings/profile-actions';

function initials(name?: string, email?: string): string {
    const src = (name || email || '?').trim();
    const parts = src.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return src.slice(0, 2).toUpperCase();
}

export function ProfileSettings({
    userName,
    userEmail,
    userLocale = 'id',
    userAvatarUrl,
}: {
    userName?: string;
    userEmail?: string;
    userLocale?: string;
    userAvatarUrl?: string | null;
}) {
    const [name, setName] = useState(userName || '');
    const [email, setEmail] = useState(userEmail || '');
    const [locale, setLocale] = useState<'id' | 'en'>(userLocale === 'en' ? 'en' : 'id');
    const [avatar, setAvatar] = useState<string | null>(userAvatarUrl || null);
    const [savingProfile, startProfile] = useTransition();
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    // Password
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPw, setShowPw] = useState(false);
    const [savingPw, startPw] = useTransition();

    const handleSaveProfile = () => {
        startProfile(async () => {
            const res = await updateOwnProfile({ name, email, locale });
            if (res.success) {
                toast.success('Profil berhasil diperbarui.');
            } else {
                toast.error(res.error || 'Gagal memperbarui profil.');
            }
        });
    };

    const handleAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadingAvatar(true);
        try {
            const fd = new FormData();
            fd.append('avatar', file);
            const res = await updateOwnAvatar(fd);
            if (res.success) {
                setAvatar(res.data.avatarUrl);
                toast.success('Foto profil diperbarui.');
            } else {
                toast.error(res.error || 'Gagal mengunggah avatar.');
            }
        } finally {
            setUploadingAvatar(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    const handleRemoveAvatar = async () => {
        setUploadingAvatar(true);
        try {
            const res = await removeOwnAvatar();
            if (res.success) {
                setAvatar(null);
                toast.success('Foto profil dihapus.');
            } else {
                toast.error(res.error || 'Gagal menghapus avatar.');
            }
        } finally {
            setUploadingAvatar(false);
        }
    };

    const handleChangePassword = () => {
        if (newPassword !== confirmPassword) {
            toast.error('Konfirmasi password tidak cocok.');
            return;
        }
        startPw(async () => {
            const res = await changeOwnPassword({ currentPassword, newPassword });
            if (res.success) {
                toast.success('Password berhasil diubah.');
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
            } else {
                toast.error(res.error || 'Gagal mengubah password.');
            }
        });
    };

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle>Informasi Profil</CardTitle>
                    <CardDescription>
                        Perbarui informasi profil dan alamat email akun Anda.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center gap-4">
                        <Avatar className="h-16 w-16">
                            {avatar ? (
                                <AvatarImage src={avatar} alt={name} />
                            ) : (
                                <AvatarFallback className="text-lg font-semibold">
                                    {initials(name, email)}
                                </AvatarFallback>
                            )}
                        </Avatar>
                        <div className="flex gap-2">
                            <input
                                ref={fileRef}
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                className="hidden"
                                onChange={handleAvatarFile}
                            />
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={uploadingAvatar}
                                onClick={() => fileRef.current?.click()}
                            >
                                {uploadingAvatar ? (
                                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <Upload className="mr-1.5 h-3.5 w-3.5" />
                                )}
                                Ubah Foto
                            </Button>
                            {avatar && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    disabled={uploadingAvatar}
                                    onClick={handleRemoveAvatar}
                                >
                                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                                    Hapus
                                </Button>
                            )}
                        </div>
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="name">Nama</Label>
                        <Input
                            id="name"
                            placeholder="Nama Anda"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                            id="email"
                            type="email"
                            placeholder="Alamat email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="locale">Bahasa</Label>
                        <Select value={locale} onValueChange={(v) => setLocale(v as 'id' | 'en')}>
                            <SelectTrigger id="locale" className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="id">Indonesia</SelectItem>
                                <SelectItem value="en">English</SelectItem>
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                            Preferensi tersimpan. Terjemahan antarmuka penuh menyusul.
                        </p>
                    </div>
                    <div className="flex justify-end">
                        <Button onClick={handleSaveProfile} disabled={savingProfile}>
                            {savingProfile && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Simpan Perubahan
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Perubahan nama tampil di seluruh aplikasi setelah Anda login ulang.
                    </p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Keamanan</CardTitle>
                    <CardDescription>
                        Ubah password akun Anda secara berkala.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-2">
                        <Label htmlFor="currentPassword">Password Saat Ini</Label>
                        <Input
                            id="currentPassword"
                            type={showPw ? 'text' : 'password'}
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="newPassword">Password Baru</Label>
                        <div className="relative">
                            <Input
                                id="newPassword"
                                type={showPw ? 'text' : 'password'}
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                            />
                            <button
                                type="button"
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                                onClick={() => setShowPw((s) => !s)}
                                tabIndex={-1}
                            >
                                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="confirmPassword">Konfirmasi Password Baru</Label>
                        <Input
                            id="confirmPassword"
                            type={showPw ? 'text' : 'password'}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                        />
                    </div>
                    <div className="flex justify-end">
                        <Button
                            variant="outline"
                            onClick={handleChangePassword}
                            disabled={savingPw || !currentPassword || !newPassword}
                        >
                            {savingPw && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Ubah Password
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </>
    );
}
