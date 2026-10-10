'use client';

import { useRef, useState, useTransition } from 'react';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Eye, EyeOff, Loader2, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
    changeOwnPassword,
    removeOwnAvatar,
    updateOwnAvatar,
    updateOwnProfile,
} from '@/actions/settings/profile-actions';

function initials(name?: string, email?: string): string {
    const src = (name || email || '?').trim();
    const parts = src.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return src.slice(0, 2).toUpperCase();
}

type ProfileValues = {
    name: string;
    email: string;
    locale: 'id' | 'en';
};

export function ProfileSettings({
    userName,
    userEmail,
    userLocale = 'id',
    userAvatarUrl,
    authMode = 'LOCAL',
}: {
    userName?: string;
    userEmail?: string;
    userLocale?: string;
    userAvatarUrl?: string | null;
    authMode?: 'LOCAL' | 'CENTRAL';
}) {
    const initialValues: ProfileValues = {
        name: userName || '',
        email: userEmail || '',
        locale: userLocale === 'en' ? 'en' : 'id',
    };
    const [name, setName] = useState(initialValues.name);
    const [email, setEmail] = useState(initialValues.email);
    const [locale, setLocale] = useState<'id' | 'en'>(initialValues.locale);
    const [savedProfile, setSavedProfile] = useState(initialValues);
    const [avatar, setAvatar] = useState<string | null>(userAvatarUrl || null);
    const [savingProfile, startProfile] = useTransition();
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const { update: updateSession } = useSession();
    const router = useRouter();

    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPw, setShowPw] = useState(false);
    const [savingPw, startPw] = useTransition();

    const profileDirty =
        name !== savedProfile.name ||
        email !== savedProfile.email ||
        locale !== savedProfile.locale;
    const passwordDirty = Boolean(
        currentPassword || newPassword || confirmPassword,
    );

    const handleSaveProfile = () => {
        startProfile(async () => {
            const res = await updateOwnProfile({ name, email, locale });
            if (res.success) {
                const saved: ProfileValues = {
                    name: res.data.name || '',
                    email: res.data.email,
                    locale: res.data.locale === 'en' ? 'en' : 'id',
                };
                setName(saved.name);
                setEmail(saved.email);
                setLocale(saved.locale);
                setSavedProfile(saved);
                toast.success('Profil berhasil diperbarui.');
                await updateSession({
                    name: res.data.name,
                    email: res.data.email,
                });
                router.refresh();
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
                await updateSession({
                    image: res.data.avatarUrl,
                    picture: res.data.avatarUrl,
                });
                router.refresh();
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
                await updateSession({ image: '', picture: '' });
                router.refresh();
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
            const res = await changeOwnPassword({
                currentPassword,
                newPassword,
            });
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
                <form
                    data-unsaved={profileDirty ? 'true' : undefined}
                    onSubmit={(event) => {
                        event.preventDefault();
                        handleSaveProfile();
                    }}
                >
                    <CardHeader>
                        <CardTitle>Informasi Profil</CardTitle>
                        <CardDescription>
                            Perbarui informasi profil dan alamat email akun
                            Anda.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                            <Avatar className="h-16 w-16">
                                {avatar ? (
                                    <AvatarImage src={avatar} alt={name} />
                                ) : (
                                    <AvatarFallback className="text-lg font-semibold">
                                        {initials(name, email)}
                                    </AvatarFallback>
                                )}
                            </Avatar>
                            <div className="flex flex-wrap gap-2">
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
                                    className="min-h-11"
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
                                        className="min-h-11"
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
                                className="min-h-11"
                                placeholder="Nama Anda"
                                value={name}
                                onChange={(event) =>
                                    setName(event.target.value)
                                }
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                className="min-h-11"
                                placeholder="Alamat email"
                                value={email}
                                readOnly={authMode === 'CENTRAL'}
                                aria-describedby={
                                    authMode === 'CENTRAL'
                                        ? 'central-email-hint'
                                        : undefined
                                }
                                onChange={(event) =>
                                    setEmail(event.target.value)
                                }
                            />
                            {authMode === 'CENTRAL' && (
                                <p
                                    id="central-email-hint"
                                    className="text-xs text-muted-foreground"
                                >
                                    Email dikelola oleh layanan login pusat dan
                                    tidak dapat diubah dari PolyFlow.
                                </p>
                            )}
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="locale">Bahasa</Label>
                            <Select
                                value={locale}
                                onValueChange={(value) =>
                                    setLocale(value as 'id' | 'en')
                                }
                            >
                                <SelectTrigger
                                    id="locale"
                                    className="min-h-11 w-full"
                                >
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="id">
                                        Indonesia
                                    </SelectItem>
                                    <SelectItem value="en">English</SelectItem>
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                                Preferensi tersimpan. Terjemahan antarmuka penuh
                                menyusul.
                            </p>
                        </div>
                        <div className="flex justify-stretch sm:justify-end">
                            <Button
                                type="submit"
                                className="min-h-11 w-full sm:w-auto"
                                disabled={savingProfile}
                            >
                                {savingProfile && (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                )}
                                Simpan Perubahan
                            </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Perubahan langsung berlaku di sidebar dan seluruh
                            aplikasi.
                        </p>
                    </CardContent>
                </form>
            </Card>

            <Card>
                {authMode === 'CENTRAL' ? (
                    <>
                        <CardHeader>
                            <CardTitle>Keamanan</CardTitle>
                            <CardDescription>
                                Kredensial akun pusat dikelola oleh layanan
                                login pusat.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">
                                Gunakan layanan login pusat untuk mengubah
                                password atau mengelola kredensial Anda.
                            </p>
                        </CardContent>
                    </>
                ) : (
                    <form
                        data-unsaved={passwordDirty ? 'true' : undefined}
                        onSubmit={(event) => {
                            event.preventDefault();
                            handleChangePassword();
                        }}
                    >
                        <CardHeader>
                            <CardTitle>Keamanan</CardTitle>
                            <CardDescription>
                                Ubah password akun Anda secara berkala.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-2">
                                <Label htmlFor="currentPassword">
                                    Password Saat Ini
                                </Label>
                                <Input
                                    id="currentPassword"
                                    className="min-h-11"
                                    type={showPw ? 'text' : 'password'}
                                    value={currentPassword}
                                    onChange={(event) =>
                                        setCurrentPassword(event.target.value)
                                    }
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="newPassword">
                                    Password Baru
                                </Label>
                                <div className="relative">
                                    <Input
                                        id="newPassword"
                                        className="min-h-11 pr-12"
                                        type={showPw ? 'text' : 'password'}
                                        value={newPassword}
                                        onChange={(event) =>
                                            setNewPassword(event.target.value)
                                        }
                                    />
                                    <button
                                        type="button"
                                        aria-label={
                                            showPw
                                                ? 'Sembunyikan password'
                                                : 'Tampilkan password'
                                        }
                                        className="absolute right-0 top-1/2 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        onClick={() =>
                                            setShowPw((visible) => !visible)
                                        }
                                    >
                                        {showPw ? (
                                            <EyeOff className="h-4 w-4" />
                                        ) : (
                                            <Eye className="h-4 w-4" />
                                        )}
                                    </button>
                                </div>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="confirmPassword">
                                    Konfirmasi Password Baru
                                </Label>
                                <Input
                                    id="confirmPassword"
                                    className="min-h-11"
                                    type={showPw ? 'text' : 'password'}
                                    value={confirmPassword}
                                    onChange={(event) =>
                                        setConfirmPassword(event.target.value)
                                    }
                                />
                            </div>
                            <div className="flex justify-stretch sm:justify-end">
                                <Button
                                    type="submit"
                                    variant="outline"
                                    className="min-h-11 w-full sm:w-auto"
                                    disabled={
                                        savingPw ||
                                        !currentPassword ||
                                        !newPassword
                                    }
                                >
                                    {savingPw && (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    )}
                                    Ubah Password
                                </Button>
                            </div>
                        </CardContent>
                    </form>
                )}
            </Card>
        </>
    );
}
