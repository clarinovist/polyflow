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
import { toast } from 'sonner';
import { Building2, Loader2, Save } from 'lucide-react';
import {
  getPaymentBanks,
  updatePaymentBanks,
} from '@/actions/settings/payment-banks-actions';
import type { TenantPaymentBanks } from '@/lib/finance/payment-methods';

interface PaymentBanksSettingsProps {
  canEdit: boolean;
}

export function PaymentBanksSettings({ canEdit }: PaymentBanksSettingsProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bcaHolder, setBcaHolder] = useState('');
  const [bcaAccount, setBcaAccount] = useState('');
  const [mandiriHolder, setMandiriHolder] = useState('');
  const [mandiriAccount, setMandiriAccount] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const result = await getPaymentBanks();
        if (cancelled) return;
        if (result.success && result.data) {
          applyBanks(result.data);
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

  const applyBanks = (banks: TenantPaymentBanks) => {
    setBcaHolder(banks.BCA?.holder ?? '');
    setBcaAccount(banks.BCA?.account ?? '');
    setMandiriHolder(banks.MANDIRI?.holder ?? '');
    setMandiriAccount(banks.MANDIRI?.account ?? '');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: TenantPaymentBanks = {};
      if (bcaAccount.trim()) {
        payload.BCA = {
          holder: bcaHolder.trim() || 'BCA',
          account: bcaAccount.trim(),
        };
      }
      if (mandiriAccount.trim()) {
        payload.MANDIRI = {
          holder: mandiriHolder.trim() || 'Mandiri',
          account: mandiriAccount.trim(),
        };
      }

      const result = await updatePaymentBanks(payload);
      if (!result.success) {
        toast.error(result.error || 'Gagal menyimpan rekening bank.');
        return;
      }
      if (result.data) applyBanks(result.data);
      toast.success(
        'Rekening bank pembayaran tersimpan. Label Transfer BCA/Mandiri & clearing Cek/Giro memakai data ini.',
      );
    } catch {
      toast.error('Gagal menyimpan rekening bank.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="col-span-1 lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Rekening Bank Pembayaran
        </CardTitle>
        <CardDescription>
          Nomor rekening perusahaan untuk metode Transfer BCA, Transfer Mandiri,
          dan alokasi clearing Cek/Giro. Data ini khusus tenant aktif — tidak
          tercampur dengan tenant lain.
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
              <div className="space-y-3 rounded-lg border p-4">
                <h3 className="font-medium">Bank BCA</h3>
                <div className="grid gap-2">
                  <Label htmlFor="bca-holder">Nama pemilik rekening</Label>
                  <Input
                    id="bca-holder"
                    value={bcaHolder}
                    onChange={(e) => setBcaHolder(e.target.value)}
                    placeholder="Contoh: MELINDO JAYA"
                    disabled={!canEdit || saving}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="bca-account">Nomor rekening</Label>
                  <Input
                    id="bca-account"
                    value={bcaAccount}
                    onChange={(e) => setBcaAccount(e.target.value)}
                    placeholder="Contoh: 3270448789"
                    disabled={!canEdit || saving}
                    inputMode="numeric"
                  />
                </div>
              </div>

              <div className="space-y-3 rounded-lg border p-4">
                <h3 className="font-medium">Bank Mandiri</h3>
                <div className="grid gap-2">
                  <Label htmlFor="mandiri-holder">Nama pemilik rekening</Label>
                  <Input
                    id="mandiri-holder"
                    value={mandiriHolder}
                    onChange={(e) => setMandiriHolder(e.target.value)}
                    placeholder="Contoh: MELINDO JAYA"
                    disabled={!canEdit || saving}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="mandiri-account">Nomor rekening</Label>
                  <Input
                    id="mandiri-account"
                    value={mandiriAccount}
                    onChange={(e) => setMandiriAccount(e.target.value)}
                    placeholder="Contoh: 1380044458789"
                    disabled={!canEdit || saving}
                    inputMode="numeric"
                  />
                </div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Kosongkan nomor rekening bank yang tidak dipakai. Tanpa norek,
              form payment tetap menampilkan opsi Transfer BCA/Mandiri, hanya
              tanpa nomor di label.
            </p>

            {canEdit ? (
              <div className="flex justify-end">
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
                Hanya Admin atau Finance yang dapat mengubah rekening bank.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
