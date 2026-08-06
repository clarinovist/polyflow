'use client';

import { useEffect, useState } from 'react';
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Building2, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import {
    getPaymentBanks,
    updatePaymentBanks,
} from '@/actions/finance/payment-banks-actions';
import { getChartOfAccounts } from '@/actions/finance/accounting';
import { filterAccountsByKind } from '@/lib/config/account-filter';
import type { TenantPaymentBank } from '@/lib/finance/payment-methods';

interface PaymentBanksSettingsProps {
    canEdit: boolean;
}

interface BankRow extends TenantPaymentBank {
    /** True until the first successful save — name is only editable while new. */
    isNew: boolean;
}

interface CoaAccount {
    id: string;
    code: string;
    name: string;
    isActive: boolean;
    isCashAccount?: boolean;
}

const LEGACY_KEYS = ['BCA', 'MANDIRI'];

function slugifyBankKey(name: string, existing: Set<string>): string {
    const base =
        name
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '')
            .slice(0, 16) || 'BANK';
    let candidate = base;
    let suffix = 2;
    while (existing.has(candidate)) {
        candidate = `${base}${suffix}`;
        suffix += 1;
    }
    return candidate;
}

function emptyLegacyRow(key: 'BCA' | 'MANDIRI'): BankRow {
    return {
        key,
        name: key === 'BCA' ? 'BCA' : 'Mandiri',
        holder: '',
        account: '',
        isNew: false,
    };
}

export function PaymentBanksSettings({ canEdit }: PaymentBanksSettingsProps) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [rows, setRows] = useState<BankRow[]>([
        emptyLegacyRow('BCA'),
        emptyLegacyRow('MANDIRI'),
    ]);
    const [accounts, setAccounts] = useState<CoaAccount[]>([]);

    const applyBanks = (banks: TenantPaymentBank[]) => {
        const byKey = new Map(banks.map((b) => [b.key, b]));
        const legacy = (['BCA', 'MANDIRI'] as const).map((key) => ({
            ...(byKey.get(key) ?? emptyLegacyRow(key)),
            isNew: false,
        }));
        const extra = banks
            .filter((b) => !LEGACY_KEYS.includes(b.key))
            .map((b) => ({ ...b, isNew: false }));
        setRows([...legacy, ...extra]);
    };

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const [banksRes, accountsRes] = await Promise.all([
                    getPaymentBanks(),
                    getChartOfAccounts(),
                ]);
                if (cancelled) return;
                if (banksRes.success && banksRes.data) {
                    applyBanks(banksRes.data);
                }
                if (accountsRes.success && accountsRes.data) {
                    setAccounts(
                        filterAccountsByKind(
                            accountsRes.data.filter(
                                (a: CoaAccount) => a.isActive,
                            ),
                            { kind: 'cash-bank' },
                        ) as CoaAccount[],
                    );
                }
            } catch {
                if (!cancelled) {
                    toast.error('Gagal memuat rekening bank.');
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const updateRow = (index: number, patch: Partial<BankRow>) => {
        setRows((prev) =>
            prev.map((row, i) => (i === index ? { ...row, ...patch } : row)),
        );
    };

    const addRow = () => {
        setRows((prev) => [
            ...prev,
            { key: '', name: '', holder: '', account: '', isNew: true },
        ]);
    };

    const removeRow = (index: number) => {
        setRows((prev) => prev.filter((_, i) => i !== index));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const usedKeys = new Set(
                rows.filter((r) => !r.isNew && r.key).map((r) => r.key),
            );
            const payload: TenantPaymentBank[] = [];
            for (const row of rows) {
                const isLegacy = LEGACY_KEYS.includes(row.key) && !row.isNew;
                if (isLegacy) {
                    if (!row.account.trim()) continue;
                    payload.push({
                        key: row.key,
                        name: row.name,
                        holder: row.holder.trim() || row.name,
                        account: row.account.trim(),
                    });
                    continue;
                }

                // Extra bank row — skip fully-empty new rows silently.
                if (!row.name.trim() && !row.account.trim()) continue;
                if (!row.name.trim()) {
                    toast.error('Nama bank wajib diisi.');
                    setSaving(false);
                    return;
                }
                if (!row.account.trim()) {
                    toast.error(`Nomor rekening ${row.name} wajib diisi.`);
                    setSaving(false);
                    return;
                }
                if (!row.glAccountId) {
                    toast.error(
                        `Pilih akun COA untuk bank ${row.name} (dipakai jurnal otomatis).`,
                    );
                    setSaving(false);
                    return;
                }
                const key =
                    row.key && !usedKeys.has(row.key)
                        ? row.key
                        : slugifyBankKey(row.name, usedKeys);
                usedKeys.add(key);
                payload.push({
                    key,
                    name: row.name.trim(),
                    holder: row.holder.trim() || row.name.trim(),
                    account: row.account.trim(),
                    glAccountId: row.glAccountId,
                });
            }

            const result = await updatePaymentBanks(payload);
            if (!result.success) {
                toast.error(result.error || 'Gagal menyimpan rekening bank.');
                return;
            }
            if (result.data) applyBanks(result.data);
            toast.success(
                'Rekening bank pembayaran tersimpan. Dropdown Metode Pembayaran ikut ter-update.',
            );
        } catch {
            toast.error('Gagal menyimpan rekening bank.');
        } finally {
            setSaving(false);
        }
    };

    const legacyRows = rows.filter(
        (r) => LEGACY_KEYS.includes(r.key) && !r.isNew,
    );
    const extraRows = rows
        .map((row, index) => ({ row, index }))
        .filter(({ row }) => row.isNew || !LEGACY_KEYS.includes(row.key));

    return (
        <Card className="max-w-4xl">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Rekening Bank Pembayaran
                </CardTitle>
                <CardDescription>
                    Nomor rekening perusahaan untuk metode Transfer, dan alokasi
                    clearing Cek/Giro, yang muncul di dropdown Metode Pembayaran
                    (Catat Pembayaran). Data ini khusus tenant aktif — tidak
                    tercampur dengan tenant lain, dan berbeda dari
                    &quot;Rekening Bank Cetak Dokumen&quot; di Company Settings
                    (itu cuma dipakai untuk cetak invoice/surat jalan/kuitansi).
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {loading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Memuat rekening bank…
                    </div>
                ) : (
                    <>
                        <div className="grid gap-6 md:grid-cols-2">
                            {legacyRows.map((row) => {
                                const index = rows.indexOf(row);
                                return (
                                    <div
                                        key={row.key}
                                        className="space-y-3 rounded-lg border p-4"
                                    >
                                        <h3 className="font-medium">
                                            Bank {row.name}
                                        </h3>
                                        <div className="grid gap-2">
                                            <Label
                                                htmlFor={`${row.key}-holder`}
                                            >
                                                Nama pemilik rekening
                                            </Label>
                                            <Input
                                                id={`${row.key}-holder`}
                                                value={row.holder}
                                                onChange={(e) =>
                                                    updateRow(index, {
                                                        holder: e.target.value,
                                                    })
                                                }
                                                placeholder="Nama pemilik rekening"
                                                disabled={!canEdit || saving}
                                            />
                                        </div>
                                        <div className="grid gap-2">
                                            <Label
                                                htmlFor={`${row.key}-account`}
                                            >
                                                Nomor rekening
                                            </Label>
                                            <Input
                                                id={`${row.key}-account`}
                                                value={row.account}
                                                onChange={(e) =>
                                                    updateRow(index, {
                                                        account: e.target.value,
                                                    })
                                                }
                                                placeholder="Nomor rekening"
                                                disabled={!canEdit || saving}
                                                inputMode="numeric"
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {extraRows.length > 0 && (
                            <div className="space-y-4">
                                <h3 className="font-medium">Bank Lainnya</h3>
                                {extraRows.map(({ row, index }) => (
                                    <div
                                        key={index}
                                        className="space-y-3 rounded-lg border p-4"
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            {row.isNew ? (
                                                <Input
                                                    value={row.name}
                                                    onChange={(e) =>
                                                        updateRow(index, {
                                                            name: e.target
                                                                .value,
                                                        })
                                                    }
                                                    placeholder="Nama bank (mis. BRI)"
                                                    disabled={
                                                        !canEdit || saving
                                                    }
                                                    className="max-w-xs"
                                                />
                                            ) : (
                                                <h4 className="font-medium">
                                                    Bank {row.name}
                                                </h4>
                                            )}
                                            {canEdit && (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() =>
                                                        removeRow(index)
                                                    }
                                                    disabled={saving}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </div>
                                        <div className="grid gap-4 md:grid-cols-2">
                                            <div className="grid gap-2">
                                                <Label>
                                                    Nama pemilik rekening
                                                </Label>
                                                <Input
                                                    value={row.holder}
                                                    onChange={(e) =>
                                                        updateRow(index, {
                                                            holder: e.target
                                                                .value,
                                                        })
                                                    }
                                                    placeholder="Nama pemilik rekening"
                                                    disabled={
                                                        !canEdit || saving
                                                    }
                                                />
                                            </div>
                                            <div className="grid gap-2">
                                                <Label>Nomor rekening</Label>
                                                <Input
                                                    value={row.account}
                                                    onChange={(e) =>
                                                        updateRow(index, {
                                                            account:
                                                                e.target.value,
                                                        })
                                                    }
                                                    placeholder="Nomor rekening"
                                                    disabled={
                                                        !canEdit || saving
                                                    }
                                                    inputMode="numeric"
                                                />
                                            </div>
                                        </div>
                                        <div className="grid gap-2">
                                            <Label>
                                                Akun COA (untuk jurnal otomatis)
                                            </Label>
                                            <Select
                                                value={row.glAccountId ?? ''}
                                                onValueChange={(value) =>
                                                    updateRow(index, {
                                                        glAccountId: value,
                                                    })
                                                }
                                                disabled={!canEdit || saving}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Pilih akun Kas/Bank" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {accounts.map((acc) => (
                                                        <SelectItem
                                                            key={acc.id}
                                                            value={acc.id}
                                                        >
                                                            {acc.code} —{' '}
                                                            {acc.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <p className="text-xs text-muted-foreground">
                                                Wajib diisi — tanpa ini,
                                                pembayaran lewat bank ini tidak
                                                bisa memposting jurnal otomatis
                                                dengan benar.
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <p className="text-xs text-muted-foreground">
                            Kosongkan nomor rekening bank yang tidak dipakai.
                            Tanpa norek, form payment tetap menampilkan opsi
                            Transfer BCA/Mandiri, hanya tanpa nomor di label.
                            Nama bank baru tidak bisa diganti setelah tersimpan
                            (menjaga histori label pembayaran tetap konsisten).
                        </p>

                        {canEdit ? (
                            <div className="flex justify-between">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={addRow}
                                    disabled={saving}
                                >
                                    <Plus className="mr-2 h-4 w-4" />
                                    Tambah Bank
                                </Button>
                                <Button onClick={handleSave} disabled={saving}>
                                    {saving ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <Save className="mr-2 h-4 w-4" />
                                    )}
                                    Simpan Rekening Bank
                                </Button>
                            </div>
                        ) : (
                            <p className="text-sm text-amber-600 dark:text-amber-400">
                                Hanya Admin atau Finance yang dapat mengubah
                                rekening bank.
                            </p>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    );
}
