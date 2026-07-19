'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import {
    getCompanySettings,
    updateCompanySettings,
    uploadCompanyLogo,
} from '@/actions/settings/company-actions';

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

export function CompanySettings() {
    const [form, setForm] = useState<CompanyForm>(EMPTY);
    const [logoUrl, setLogoUrl] = useState<string | null>(null);
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
            }
            setLoading(false);
        })();
    }, []);

    const setField = (key: keyof CompanyForm) => (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

    const handleSave = () => {
        startSaving(async () => {
            // Only send non-empty fields so blank inputs don't overwrite env
            // defaults with empty strings.
            const payload = Object.fromEntries(
                Object.entries(form).filter(([, v]) => v.trim() !== ''),
            );
            const res = await updateCompanySettings(payload);
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
                    <Input id="companySigner" value={form.signerName} onChange={setField('signerName')} placeholder="mis. Nugroho Pramono" />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="companyFooter">Catatan Footer Cetak</Label>
                    <Textarea id="companyFooter" value={form.footerNote} onChange={setField('footerNote')} rows={2} />
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
