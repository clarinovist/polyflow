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
import { AlertTriangle, Info, Loader2, Route, Save } from 'lucide-react';
import { toast } from 'sonner';
import {
    getRoutingFeatureSettings,
    saveRoutingFeatureSettings,
} from '@/actions/settings/routing-feature-settings';

export function RoutingFeatureSettings() {
    const [enabled, setEnabled] = useState(false);
    const [globalEnvEnabled, setGlobalEnvEnabled] = useState(true);
    const [loading, setLoading] = useState(true);
    const [saving, startSaving] = useTransition();

    useEffect(() => {
        getRoutingFeatureSettings().then((result) => {
            if (result.success && result.data) {
                setEnabled(result.data.tenantEnabled);
                setGlobalEnvEnabled(result.data.globalEnvEnabled);
            }
            setLoading(false);
        });
    }, []);

    function handleSave() {
        startSaving(async () => {
            const result = await saveRoutingFeatureSettings({ enabled });
            if (result.success) {
                toast.success('Pengaturan routing disimpan');
            } else {
                toast.error(
                    result.error ?? 'Gagal menyimpan pengaturan routing',
                );
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
                    <Route className="h-5 w-5" />
                    Fitur Routing Produksi
                </CardTitle>
                <CardDescription>
                    Routing menjelaskan urutan proses (Mix → Extrude → Rewind →
                    Pack, dst) untuk tiap varian produk jadi, dipakai untuk
                    generate SPK berantai lewat Production Run.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {!globalEnvEnabled && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-3 flex gap-2 text-sm text-amber-700 dark:text-amber-300">
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                        <p>
                            Toggle di bawah ini mengatur izin untuk tenant Anda
                            saja. Server belum mengizinkan fitur ini secara
                            global (env var <code>ROUTING_ENABLED</code> belum
                            aktif) — hubungi admin infra untuk mengaktifkannya
                            juga di server, kalau tidak, routing tetap tidak
                            bisa dipakai walau toggle di sini ON.
                        </p>
                    </div>
                )}

                <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30 p-3 flex gap-2 text-sm text-blue-700 dark:text-blue-300">
                    <Info className="h-4 w-4 shrink-0 mt-0.5" />
                    <p>
                        Setelah aktif, menu Routing Produksi (Mix/Extrude/dsb)
                        dan Production Run akan bisa dipakai. Tanpa routing, BoM
                        tetap bisa dipakai untuk SPK manual seperti biasa.
                    </p>
                </div>

                <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <Label>Aktifkan Routing Produksi</Label>
                        <p className="text-sm text-muted-foreground">
                            Mengizinkan tenant ini membuat routing dan
                            production run berbasis routing.
                        </p>
                    </div>
                    <Switch checked={enabled} onCheckedChange={setEnabled} />
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
