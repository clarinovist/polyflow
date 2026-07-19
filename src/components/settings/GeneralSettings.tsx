'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

import { PaymentBanksSettings } from '@/components/settings/PaymentBanksSettings';
import { ProfileSettings } from '@/components/settings/ProfileSettings';
import { ThemeSettings } from '@/components/settings/ThemeSettings';
import { SecuritySettings } from '@/components/settings/SecuritySettings';

export function GeneralSettings({
    tenantName,
    userName,
    userEmail,
    userLocale,
    userAvatarUrl,
    canEditPaymentBanks = false,
}: {
    tenantName?: string;
    userName?: string;
    userEmail?: string;
    userLocale?: string;
    userAvatarUrl?: string | null;
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

            <ProfileSettings
                userName={userName}
                userEmail={userEmail}
                userLocale={userLocale}
                userAvatarUrl={userAvatarUrl}
            />

            <ThemeSettings />

            <SecuritySettings />
        </div>
    );
}
