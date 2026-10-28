'use client';

import { useEffect, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { AlertTriangle, Calculator, Info, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import {
    getConversionCostSettings,
    saveConversionCostSettings,
} from '@/actions/settings/conversion-cost-settings';

type ExpenseAccount = {
    id: string;
    code: string;
    name: string;
    isActive: boolean;
};

export function ConversionCostSettings() {
    const [enabled, setEnabled] = useState(false);
    const [accountIds, setAccountIds] = useState<string[]>([]);
    const [accounts, setAccounts] = useState<ExpenseAccount[]>([]);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, startSaving] = useTransition();

    useEffect(() => {
        getConversionCostSettings().then((result) => {
            if (result.success && result.data) {
                setEnabled(result.data.setting.enabled);
                setAccountIds(result.data.setting.accountIds);
                setAccounts(result.data.accounts);
            } else {
                // Never offer a save over a setting we could not read.
                setLoadError(
                    result.success
                        ? 'Pengaturan tidak dapat dimuat.'
                        : result.error,
                );
            }
            setLoading(false);
        });
    }, []);

    function toggleAccount(id: string, checked: boolean) {
        setAccountIds((current) =>
            checked
                ? [...current, id]
                : current.filter((value) => value !== id),
        );
    }

    function handleSave() {
        startSaving(async () => {
            const result = await saveConversionCostSettings({
                enabled,
                accountIds,
            });
            if (result.success) {
                toast.success('Sumber biaya konversi disimpan');
            } else {
                toast.error(
                    result.error ?? 'Gagal menyimpan sumber biaya konversi',
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
                    <Calculator className="h-5 w-5" />
                    Sumber biaya konversi HPP
                </CardTitle>
                <CardDescription>
                    Biaya tenaga kerja, listrik, dan perawatan pada Laporan HPP.
                    Default: dihitung dari jam sesi kiosk.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {loadError ? (
                    <p role="alert" className="text-sm text-destructive">
                        {loadError}
                    </p>
                ) : (
                    <>
                        <div className="flex items-center justify-between gap-4">
                            <div className="space-y-0.5">
                                <Label htmlFor="conversion-cost-enabled">
                                    Ambil biaya konversi dari jurnal
                                </Label>
                                <p className="text-sm text-muted-foreground">
                                    Saldo jurnal terposting dari akun terpilih
                                    pada periode laporan dibagi ke SPK yang
                                    selesai di periode itu, sebanding biaya
                                    bahannya. Jam sesi kiosk tidak lagi dihitung
                                    sebagai biaya.
                                </p>
                            </div>
                            <Switch
                                id="conversion-cost-enabled"
                                checked={enabled}
                                onCheckedChange={setEnabled}
                            />
                        </div>

                        {enabled && (
                            <div className="space-y-3">
                                <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30 p-3 flex gap-2 text-sm text-blue-700 dark:text-blue-300">
                                    <Info className="h-4 w-4 shrink-0 mt-0.5" />
                                    <p>
                                        SPK yang masih berjalan tidak mendapat
                                        alokasi; biayanya masuk saat SPK
                                        selesai.
                                    </p>
                                </div>
                                {accountIds.length === 0 && (
                                    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-3 flex gap-2 text-sm text-amber-800 dark:text-amber-300">
                                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                                        <p>
                                            Belum ada akun dipilih: laporan
                                            tidak memuat biaya konversi sama
                                            sekali, termasuk dari sesi kiosk.
                                        </p>
                                    </div>
                                )}
                                <div className="max-h-72 overflow-y-auto rounded-lg border divide-y">
                                    {accounts.map((account) => {
                                        const id = `conversion-account-${account.id}`;
                                        return (
                                            <div
                                                key={account.id}
                                                className="flex items-center gap-3 px-3 py-2 min-h-11"
                                            >
                                                <Checkbox
                                                    id={id}
                                                    checked={accountIds.includes(
                                                        account.id,
                                                    )}
                                                    onCheckedChange={(
                                                        checked,
                                                    ) =>
                                                        toggleAccount(
                                                            account.id,
                                                            checked === true,
                                                        )
                                                    }
                                                />
                                                <Label
                                                    htmlFor={id}
                                                    className="font-normal"
                                                >
                                                    {account.code}{' '}
                                                    {account.name}
                                                    {!account.isActive &&
                                                        ' (nonaktif)'}
                                                </Label>
                                            </div>
                                        );
                                    })}
                                    {accounts.length === 0 && (
                                        <p className="px-3 py-2 text-sm text-muted-foreground">
                                            Belum ada akun beban aktif.
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}

                        {!enabled && accountIds.length > 0 && (
                            <p className="text-sm text-muted-foreground">
                                Menyimpan dalam keadaan nonaktif akan
                                mengosongkan pilihan akun.
                            </p>
                        )}

                        <Button onClick={handleSave} disabled={saving}>
                            {saving ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                                <Save className="h-4 w-4 mr-2" />
                            )}
                            Simpan
                        </Button>
                    </>
                )}
            </CardContent>
        </Card>
    );
}
