'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { saveBarterPartner } from '@/actions/finance/barter-actions';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

export type CustomerBarterSettingsValue = {
    partner: {
        id: string;
        supplierId: string;
        isActive: boolean;
        supplier: { id: string; name: string; code: string | null };
        _count: { settlements: number };
    } | null;
    candidates: Array<{ id: string; name: string; code: string | null }>;
};

export function CustomerBarterSettings({
    customerId,
    initialValue,
}: {
    customerId: string;
    initialValue: CustomerBarterSettingsValue;
}) {
    const [supplierId, setSupplierId] = useState(
        initialValue.partner?.supplierId ?? '',
    );
    const [isActive, setIsActive] = useState(
        initialValue.partner?.isActive ?? false,
    );
    const [saving, setSaving] = useState(false);
    const locked = (initialValue.partner?._count.settlements ?? 0) > 0;
    const candidates = initialValue.partner
        ? [
              initialValue.partner.supplier,
              ...initialValue.candidates.filter(
                  (candidate) =>
                      candidate.id !== initialValue.partner?.supplierId,
              ),
          ]
        : initialValue.candidates;

    const handleSave = async () => {
        if (!supplierId) {
            toast.error('Pilih supplier pasangan terlebih dahulu.');
            return;
        }
        setSaving(true);
        try {
            const result = await saveBarterPartner({
                customerId,
                supplierId,
                isActive,
            });
            if (!result.success) {
                toast.error(result.error);
                return;
            }
            toast.success('Pengaturan barter berhasil disimpan.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Pengaturan Barter Piutang–Hutang</CardTitle>
                <CardDescription>
                    Hanya supplier aktif dengan nama yang sama persis setelah
                    normalisasi yang dapat dipasangkan. Aktivasi tidak terjadi
                    otomatis.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="barter-supplier">Supplier pasangan</Label>
                    <Select
                        value={supplierId || undefined}
                        onValueChange={setSupplierId}
                        disabled={locked || saving}
                    >
                        <SelectTrigger id="barter-supplier">
                            <SelectValue placeholder="Pilih supplier" />
                        </SelectTrigger>
                        <SelectContent>
                            {candidates.map((supplier) => (
                                <SelectItem
                                    key={supplier.id}
                                    value={supplier.id}
                                >
                                    {supplier.name}
                                    {supplier.code ? ` — ${supplier.code}` : ''}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {candidates.length === 0 && (
                        <p className="text-sm text-amber-600">
                            Tidak ada supplier aktif dengan nama yang sama.
                        </p>
                    )}
                    {locked && (
                        <p className="text-xs text-muted-foreground">
                            Pasangan terkunci karena sudah memiliki histori
                            settlement. Pasangan tetap dapat dinonaktifkan.
                        </p>
                    )}
                </div>
                <div className="flex items-center justify-between rounded-md border p-3">
                    <div>
                        <Label htmlFor="barter-active">Izinkan barter</Label>
                        <p className="text-xs text-muted-foreground">
                            Finance dapat memilih metode barter pada invoice
                            customer ini.
                        </p>
                    </div>
                    <Switch
                        id="barter-active"
                        checked={isActive}
                        onCheckedChange={setIsActive}
                        disabled={!supplierId || saving}
                    />
                </div>
                <Button onClick={handleSave} disabled={!supplierId || saving}>
                    {saving && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Simpan Pengaturan Barter
                </Button>
            </CardContent>
        </Card>
    );
}
