'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { toast } from 'sonner';
import { PaymentBanksSettings } from '@/components/settings/PaymentBanksSettings';

export function GeneralSettings({
    tenantName,
    userName,
    userEmail,
    canEditPaymentBanks = false,
}: {
    tenantName?: string;
    userName?: string;
    userEmail?: string;
    canEditPaymentBanks?: boolean;
}) {
    return (
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
            <Card className="col-span-1 lg:col-span-2">
                <CardHeader>
                    <CardTitle>Organisasi / Tenant Aktif</CardTitle>
                    <CardDescription>
                        Ini menunjukkan database yang sedang terhubung ke sesi Anda saat ini.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/50">
                        <div className="space-y-0.5">
                            <h3 className="text-base font-semibold text-primary">{tenantName || 'Database Utama'}</h3>
                            <p className="text-sm text-muted-foreground">
                                Data sepenuhnya terisolasi untuk tenant ini.
                            </p>
                        </div>
                        <Button variant="outline" disabled>
                            Aktif
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <PaymentBanksSettings canEdit={canEditPaymentBanks} />

            <Card>
                <CardHeader>
                    <CardTitle>Informasi Profil</CardTitle>
                    <CardDescription>
                        Perbarui informasi profil dan alamat email akun Anda.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-2">
                        <Label htmlFor="name">Nama</Label>
                        <Input id="name" placeholder="Nama Anda" defaultValue={userName || ''} />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="email">Email</Label>
                        <Input id="email" type="email" placeholder="Alamat email" defaultValue={userEmail || ''} />
                    </div>
                    <div className="flex justify-end">
                        <Button
                            onClick={() => toast.success('Profil berhasil diperbarui.')}
                        >
                            Simpan Perubahan
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Card className="flex flex-col">
                <CardHeader>
                    <CardTitle>Tampilan</CardTitle>
                    <CardDescription>
                        Sesuaikan tampilan dan nuansa aplikasi.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="space-y-0.5">
                            <h3 className="text-base font-medium">Preferensi Tema</h3>
                            <p className="text-sm text-muted-foreground">
                                Beralih antara mode terang dan gelap.
                            </p>
                        </div>
                        <Button variant="outline" disabled>
                            Dikelola via ThemeProvider
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
