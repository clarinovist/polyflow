'use client';

import { useEffect, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Info, Loader2, Save, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import {
    getKioskFeatureSettings,
    saveKioskFeatureSettings,
} from '@/actions/settings/kiosk-feature-settings';
import { settingsLabels } from '@/lib/labels';

export function KioskFeatureSettings() {
    const [hasProsesKhusus, setHasProsesKhusus] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, startSaving] = useTransition();

    useEffect(() => {
        getKioskFeatureSettings().then((result) => {
            if (result.success && result.data) {
                setHasProsesKhusus(result.data.hasProsesKhusus);
            }
            setLoading(false);
        });
    }, []);

    function handleSave() {
        startSaving(async () => {
            const result = await saveKioskFeatureSettings({
                hasProsesKhusus,
            });
            if (result.success) {
                toast.success('Pengaturan kiosk disimpan');
            } else {
                toast.error(result.error ?? 'Gagal menyimpan pengaturan kiosk');
            }
        });
    }

    if (loading) {
        return (
            <Card>
                <CardContent className="p-8 flex justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Wrench className="h-5 w-5" />
                    {settingsLabels.kioskProduksi}
                </CardTitle>
                <CardDescription>
                    Konfigurasi fitur kiosk produksi untuk tenant ini
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30 p-3 flex gap-2 text-sm text-blue-700 dark:text-blue-300">
                    <Info className="h-4 w-4 shrink-0 mt-0.5" />
                    <p>
                        Berlaku hanya untuk tenant yang menggunakan proses
                        film-bag.
                    </p>
                </div>

                <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <Label>Aktifkan Proses Khusus HD &amp; Potong/Plong</Label>
                        <p className="text-sm text-muted-foreground">
                            Menampilkan tile Proses Khusus di hub kiosk dan
                            mengizinkan akses langsung ke laporan HD serta
                            Potong/Plong.
                        </p>
                    </div>
                    <Switch
                        checked={hasProsesKhusus}
                        onCheckedChange={setHasProsesKhusus}
                    />
                </div>

                <Button onClick={handleSave} disabled={saving}>
                    {saving ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                        <Save className="h-4 w-4 mr-2" />
                    )}
                    Simpan
                </Button>
            </CardContent>
        </Card>
    );
}
