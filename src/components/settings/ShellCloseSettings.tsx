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
import { Clock, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import {
    getShellCloseSettings,
    saveShellCloseSettings,
} from '@/actions/settings/shell-close-settings';

export function ShellCloseSettings() {
    const [atLastOutput, setAtLastOutput] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, startSaving] = useTransition();

    useEffect(() => {
        getShellCloseSettings().then((result) => {
            if (result.success && result.data) {
                setAtLastOutput(result.data.atLastOutput);
            }
            setLoading(false);
        });
    }, []);

    function handleSave() {
        startSaving(async () => {
            const result = await saveShellCloseSettings({ atLastOutput });
            if (result.success) {
                toast.success('Aturan penutupan sesi disimpan');
            } else {
                toast.error(
                    result.error ?? 'Gagal menyimpan aturan penutupan sesi',
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
                    <Clock className="h-5 w-5" />
                    Penutupan sesi saat SPK selesai
                </CardTitle>
                <CardDescription>
                    Sesi kiosk yang belum dihentikan ditutup otomatis ketika SPK
                    diselesaikan dari halaman admin.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="flex items-center justify-between gap-4">
                    <div className="space-y-0.5">
                        <Label htmlFor="shell-close-at-last-output">
                            Akhiri di jam hasil terakhir
                        </Label>
                        <p className="text-sm text-muted-foreground">
                            Aktif: sesi berakhir di jam hasil terakhir mesin
                            yang sama, sehingga jam kerja ikut dihitung di
                            laporan biaya. Nonaktif: sesi dicatat 0 jam.
                        </p>
                    </div>
                    <Switch
                        id="shell-close-at-last-output"
                        checked={atLastOutput}
                        onCheckedChange={setAtLastOutput}
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
