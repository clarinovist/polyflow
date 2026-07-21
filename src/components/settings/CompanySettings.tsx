'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Upload, Plus, Trash2, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import {
    getCompanySettings,
    updateCompanySettings,
    uploadCompanyLogo,
} from '@/actions/settings/company-actions';

interface BankRow {
    holder: string;
    bank: string;
    account: string;
}

interface CompanyForm {
    name: string;
    address: string;
    phone: string;
    email: string;
    footerNote: string;
    signerName: string;
}

const EMPTY: CompanyForm = {
    name: '',
    address: '',
    phone: '',
    email: '',
    footerNote: '',
    signerName: '',
};

function parseBankJson(raw: string | undefined): BankRow[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((r: unknown) => r && typeof r === 'object')
            .map((r: unknown) => {
                const o = r as Record<string, unknown>;
                return {
                    holder: typeof o.holder === 'string' ? o.holder : '',
                    bank: typeof o.bank === 'string' ? o.bank : '',
                    account: typeof o.account === 'string' ? o.account : '',
                };
            })
            .filter((r) => r.account || r.holder || r.bank);
    } catch {
        return [];
    }
}

function BankAccountsEditor({
    title,
    description,
    rows,
    onChange,
}: {
    title: string;
    description: string;
    rows: BankRow[];
    onChange: (next: BankRow[]) => void;
}) {
    const addRow = () => onChange([...rows, { holder: '', bank: '', account: '' }]);
    const removeRow = (i: number) => onChange(rows.filter((_, idx) => idx !== i));
    const updateRow = (i: number, field: keyof BankRow, val: string) => {
        const next = rows.slice();
        next[i] = { ...next[i], [field]: val };
        onChange(next);
    };
    return (
        <div className="space-y-3 rounded-lg border p-4">
            <div>
                <h4 className="font-medium flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    {title}
                </h4>
                <p className="text-xs text-muted-foreground mt-1">{description}</p>
            </div>
            {rows.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2 border border-dashed rounded px-3">
                    Belum ada rekening. Klik Tambah.
                </p>
            ) : (
                <div className="space-y-2">
                    {rows.map((r, i) => (
                        <div key={i} className="grid grid-cols-12 gap-2 items-end">
                            <div className="col-span-4">
                                <Label className="text-xs">Pemilik</Label>
                                <Input value={r.holder} onChange={(e) => updateRow(i, 'holder', e.target.value)} placeholder="Nama pemilik" className="h-8 text-sm" />
                            </div>
                            <div className="col-span-4">
                                <Label className="text-xs">Bank</Label>
                                <Input value={r.bank} onChange={(e) => updateRow(i, 'bank', e.target.value)} placeholder="Bank BCA" className="h-8 text-sm" />
                            </div>
                            <div className="col-span-3">
                                <Label className="text-xs">No Rekening</Label>
                                <Input value={r.account} onChange={(e) => updateRow(i, 'account', e.target.value)} placeholder="1234567890" className="h-8 text-sm" inputMode="numeric" />
                            </div>
                            <div className="col-span-1 flex justify-end">
                                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeRow(i)}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            <Button type="button" variant="outline" size="sm" onClick={addRow}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Tambah Rekening
            </Button>
        </div>
    );
}

export function CompanySettings() {
    const [form, setForm] = useState<CompanyForm>(EMPTY);
    const [logoUrl, setLogoUrl] = useState<string | null>(null);
    const [banksNonPPN, setBanksNonPPN] = useState<BankRow[]>([]);
    const [banksPPN, setBanksPPN] = useState<BankRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, startSaving] = useTransition();
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        (async () => {
            const res = await getCompanySettings();
            if (res.success) {
                setForm({
                    name: res.data.name || '',
                    address: res.data.address || '',
                    phone: res.data.phone || '',
                    email: res.data.email || '',
                    footerNote: res.data.footerNote || '',
                    signerName: res.data.signerName || '',
                });
                setLogoUrl(res.data.logoUrl || null);
                setBanksNonPPN(parseBankJson(res.data.bankAccountsNonPPN));
                setBanksPPN(parseBankJson(res.data.bankAccountsPPN));
            }
            setLoading(false);
        })();
    }, []);

    const setField = (key: keyof CompanyForm) => (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

    const handleSave = () => {
        startSaving(async () => {
            const payload: Record<string, string> = Object.fromEntries(
                Object.entries(form).filter(([, v]) => (v as string).trim() !== ''),
            ) as Record<string, string>;
            // Bank accounts: save as JSON, allow empty to clear
            payload.bankAccountsNonPPN = JSON.stringify(
                banksNonPPN.filter((r) => r.account.trim() || r.holder.trim() || r.bank.trim()),
            );
            payload.bankAccountsPPN = JSON.stringify(
                banksPPN.filter((r) => r.account.trim() || r.holder.trim() || r.bank.trim()),
            );
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const res = await updateCompanySettings(payload as any);
            if (res.success) {
                toast.success('Pengaturan perusahaan disimpan. Akan dipakai pada dokumen cetak berikutnya.');
            } else {
                toast.error(res.error || 'Gagal menyimpan pengaturan perusahaan.');
            }
        });
    };

    const handleLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadingLogo(true);
        try {
            const fd = new FormData();
            fd.append('logo', file);
            const res = await uploadCompanyLogo(fd);
            if (res.success) {
                setLogoUrl(res.data.logoUrl);
                toast.success('Logo perusahaan diperbarui.');
            } else {
                toast.error(res.error || 'Gagal mengunggah logo.');
            }
        } finally {
            setUploadingLogo(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    if (loading) {
        return (
            <Card className="max-w-2xl">
                <CardContent className="flex h-48 items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="max-w-2xl">
            <CardHeader>
                <CardTitle>Informasi Perusahaan</CardTitle>
                <CardDescription>
                    Digunakan pada dokumen cetak (surat jalan, invoice, kuitansi) untuk tenant ini.
                    Kosongkan field untuk memakai nilai default sistem.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                    <div className="h-16 w-16 shrink-0 rounded-lg border bg-muted/50 flex items-center justify-center overflow-hidden">
                        {logoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={logoUrl} alt="Logo perusahaan" className="h-full w-full object-contain" />
                        ) : (
                            <span className="text-xs text-muted-foreground">Logo</span>
                        )}
                    </div>
                    <div>
                        <input
                            ref={fileRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden"
                            onChange={handleLogoFile}
                        />
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={uploadingLogo}
                            onClick={() => fileRef.current?.click()}
                        >
                            {uploadingLogo ? (
                                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            ) : (
                                <Upload className="mr-1.5 h-3.5 w-3.5" />
                            )}
                            Unggah Logo
                        </Button>
                    </div>
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="companyName">Nama Perusahaan</Label>
                    <Input id="companyName" value={form.name} onChange={setField('name')} placeholder="mis. CV Melindo Jaya" />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="companyAddress">Alamat</Label>
                    <Textarea id="companyAddress" value={form.address} onChange={setField('address')} rows={3} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="grid gap-2">
                        <Label htmlFor="companyPhone">Telepon</Label>
                        <Input id="companyPhone" value={form.phone} onChange={setField('phone')} />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="companyEmail">Email</Label>
                        <Input id="companyEmail" type="email" value={form.email} onChange={setField('email')} />
                    </div>
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="companySigner">Nama Penandatangan</Label>
                    <Input id="companySigner" value={form.signerName} onChange={setField('signerName')} placeholder="mis. Nama Penandatangan" />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="companyFooter">Catatan Footer Cetak</Label>
                    <Textarea id="companyFooter" value={form.footerNote} onChange={setField('footerNote')} rows={2} />
                </div>

                <div className="space-y-4 pt-2 border-t">
                    <div>
                        <h3 className="font-medium">Rekening Bank Cetak Dokumen</h3>
                        <p className="text-xs text-muted-foreground">Dipakai pada invoice, surat jalan, kuitansi. Pisahkan PPN dan Non-PPN. Data tenant-isolated.</p>
                    </div>
                    <BankAccountsEditor
                        title="Non-PPN (contoh potongan / umum)"
                        description="Tampilkan saat invoice tanpa PPN."
                        rows={banksNonPPN}
                        onChange={setBanksNonPPN}
                    />
                    <BankAccountsEditor
                        title="PPN"
                        description="Tampilkan saat invoice dengan PPN."
                        rows={banksPPN}
                        onChange={setBanksPPN}
                    />
                </div>

                <div className="flex justify-end">
                    <Button onClick={handleSave} disabled={saving}>
                        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Simpan Perubahan
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
