'use client';

import { useTransition } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Loader2, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { logoutAllDevices } from '@/actions/settings/profile-actions';
import { signOut } from 'next-auth/react';

export function SecuritySettings() {
    const [pending, startTransition] = useTransition();

    const handleLogoutAll = () => {
        startTransition(async () => {
            const res = await logoutAllDevices();
            if (res.success) {
                toast.success('Berhasil keluar dari semua perangkat. Anda akan diarahkan ke halaman login.');
                await signOut({ callbackUrl: '/login' });
            } else {
                toast.error(res.error || 'Gagal keluar dari semua perangkat.');
            }
        });
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Sesi & Perangkat</CardTitle>
                <CardDescription>
                    Keluar paksa dari semua perangkat yang pernah login, termasuk sesi ini.
                    Berguna jika perangkat Anda hilang atau password bocor.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button variant="destructive" disabled={pending}>
                            {pending ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <LogOut className="mr-2 h-4 w-4" />
                            )}
                            Keluar dari Semua Perangkat
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Keluar dari semua perangkat?</AlertDialogTitle>
                            <AlertDialogDescription>
                                Semua sesi login Anda — di perangkat manapun, termasuk sesi ini —
                                akan langsung tidak valid. Anda perlu login ulang.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Batal</AlertDialogCancel>
                            <AlertDialogAction onClick={handleLogoutAll}>
                                Ya, Keluar Semua
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </CardContent>
        </Card>
    );
}
